const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs-extra");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (Render-safe)
app.use(express.static(__dirname));

const VENMO_USERNAME = "dtanque";
const PRICE_PER_PLAYER_LINE = 20;
const PRICE_PER_BUSINESS_LINE = 200;
const CSV_FILE = path.join(__dirname, "orders.csv");

// -------------------- EMAIL --------------------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// -------------------- CSV INIT --------------------
if (!fs.existsSync(CSV_FILE)) {
  const headers = [
    "Timestamp",
    "Player Name",
    "Team/Coach",
    "Email",
    "Shirt Size",
    "Number of Player Lines",
    ...Array.from({ length: 20 }, (_, i) => `Player Line ${i + 1}`),
    "Business Design Purchased",
    "Number of Business Lines",
    ...Array.from({ length: 10 }, (_, i) => `Business Line ${i + 1}`),
    "Total Amount"
  ];
  fs.writeFileSync(CSV_FILE, headers.join(",") + "\n");
}

// -------------------- SUBMIT --------------------
app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    if (!data.terms) {
      return res.status(400).json({ error: "Terms not accepted" });
    }

    const playerLinesCount = parseInt(data.lineCount) || 0;
    const businessLinesCount =
      data.businessDesign === "yes" ? parseInt(data.businessLines) || 0 : 0;

    const totalAmount =
      playerLinesCount * PRICE_PER_PLAYER_LINE +
      businessLinesCount * PRICE_PER_BUSINESS_LINE;

    const playerLines = [];
    for (let i = 1; i <= playerLinesCount; i++) {
      playerLines.push(data[`line${i}`] || "");
    }

    const businessLines = [];
    if (data.businessDesign === "yes") {
      for (let i = 1; i <= businessLinesCount; i++) {
        businessLines.push(data[`businessLine${i}`] || "");
      }
    }

    const timestamp = new Date().toISOString();

    const csvRow = [
      timestamp,
      data.playerName,
      data.teamName,
      data.email,
      data.shirtSize,
      playerLinesCount,
      ...Array.from({ length: 20 }, (_, i) => playerLines[i] || ""),
      data.businessDesign || "No",
      businessLinesCount,
      ...Array.from({ length: 10 }, (_, i) => businessLines[i] || ""),
      totalAmount
    ].map(v => `"${v}"`).join(",") + "\n";

    await fs.appendFile(CSV_FILE, csvRow);

    const note = encodeURIComponent(`Fundraiser - ${data.playerName}`);
    const venmoLink = `https://venmo.com/?txn=pay&recipients=${VENMO_USERNAME}&amount=${totalAmount}&note=${note}`;

    // Build detailed line lists
    const playerLinesText = playerLinesCount
      ? playerLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")
      : "  (none)";

    const businessLinesText = businessLinesCount
      ? businessLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")
      : "  (none)";

    // Admin email (FULL DETAILS)
    const adminEmailText = `New Shirt Order

Date/Time: ${timestamp}

Player Name: ${data.playerName}
Team/Coach: ${data.teamName}
Customer Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Purchased: ${playerLinesCount}
Supporter Names:
${playerLinesText}

Business Design Purchased: ${data.businessDesign || "No"}
Business Lines Purchased: ${businessLinesCount}
Business Names:
${businessLinesText}

Total Amount: $${totalAmount}

If you did not process your Venmo payment at checkout, please click here to finish payment:
${venmoLink}
`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "New Shirt Order",
      text: adminEmailText
    });

    // Customer email (FULL DETAILS + PAYMENT LINK MESSAGE)
    const customerEmailText = `Thank you for your order!

Order Summary
-----------------------
Player Name: ${data.playerName}
Team/Coach: ${data.teamName}
Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Purchased: ${playerLinesCount}
Supporter Names:
${playerLinesText}

Business Design Purchased: ${data.businessDesign || "No"}
Business Lines Purchased: ${businessLinesCount}
Business Names:
${businessLinesText}

Total Amount: $${totalAmount}
-----------------------

If you did not process your Venmo payment at checkout, please click here to finish payment:
${venmoLink}
`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: "Your Shirt Order Confirmation",
      text: customerEmailText
    });

    res.json({
      amount: totalAmount,
      venmoLink
    });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// CSV download
app.get("/admin/orders.csv", (req, res) => {
  res.download(CSV_FILE, "orders.csv");
});

// -------------------- PORT (RENDER FIX) --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
