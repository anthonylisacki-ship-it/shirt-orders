const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("."));

const VENMO_USERNAME = "vastprinting";
const PRICE_PER_PLAYER_LINE = 20;
const PRICE_PER_BUSINESS_LINE = 200;
const CSV_FILE = path.join(__dirname, "orders.csv");

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "anthonylisacki@gmail.com",
    pass: "uayn rtrh ubdi zsik" // Use environment variable in production!
  }
});

// Ensure CSV file exists with headers
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

app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    if (!data.terms) return res.status(400).json({ error: "Terms not accepted" });

    // Parse numbers
    const playerLinesCount = parseInt(data.lineCount) || 0;
    const businessLinesCount =
      data.businessDesign === "yes" ? parseInt(data.businessLines) || 0 : 0;

    // Calculate total
    const totalAmount =
      playerLinesCount * PRICE_PER_PLAYER_LINE +
      businessLinesCount * PRICE_PER_BUSINESS_LINE;

    // Collect player lines
    const playerLines = [];
    for (let i = 1; i <= playerLinesCount; i++) {
      playerLines.push(data[`line${i}`] || "");
    }

    // Collect business lines
    const businessLines = [];
    if (data.businessDesign === "yes") {
      for (let i = 1; i <= businessLinesCount; i++) {
        businessLines.push(data[`businessLine${i}`] || "");
      }
    }

    const timestamp = new Date().toISOString();

    // Prepare CSV row
    const playerLineColumns = [];
    for (let i = 0; i < 20; i++) playerLineColumns.push(playerLines[i] || "");

    const businessLineColumns = [];
    for (let i = 0; i < 10; i++) businessLineColumns.push(businessLines[i] || "");

    const csvRow = [
      timestamp,
      data.playerName,
      data.teamName,
      data.email,
      data.shirtSize,
      playerLinesCount,
      ...playerLineColumns,
      data.businessDesign || "No",
      businessLinesCount,
      ...businessLineColumns,
      totalAmount
    ]
      .map(v => `"${v}"`)
      .join(",") + "\n";

    await fs.appendFile(CSV_FILE, csvRow);

    // Venmo link
    const note = encodeURIComponent(`Fundraiser - ${data.playerName}`);
    const venmoLink = `https://venmo.com/?txn=pay&recipients=${VENMO_USERNAME}&amount=${totalAmount}&note=${note}`;

    // --- Admin email ---
    let adminEmailText = `New Shirt Order:

Date/Time: ${timestamp}
Player Name: ${data.playerName}
Team/Coach: ${data.teamName}
Email: ${data.email}

Shirt Size: ${data.shirtSize}
Number of Player Lines: ${playerLinesCount}
Player Line Names:
${playerLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")}

Business Design Purchased: ${data.businessDesign || "No"}
Number of Business Lines: ${businessLinesCount}
Business Line Names:
${businessLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")}

Total Amount: $${totalAmount}
`;

    await transporter.sendMail({
      from: "anthonylisacki@gmail.com",
      to: "anthonylisacki@gmail.com",
      subject: "New Shirt Order",
      text: adminEmailText
    });

    // --- Customer confirmation email ---
    let customerText = `Thank you for your order!

Order Summary:
-----------------------
Player Name: ${data.playerName}
Team/Coach: ${data.teamName}
Email: ${data.email}
Shirt Size: ${data.shirtSize}

Number of Player Lines: ${playerLinesCount}
Player Line Names:
${playerLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")}

Business Design Purchased: ${data.businessDesign || "No"}
Number of Business Lines: ${businessLinesCount}
Business Line Names:
${businessLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")}

Total Amount: $${totalAmount}
-----------------------

Pay here on Venmo: ${venmoLink}

${
  data.businessDesign === "yes"
    ? "\nIf you purchased a business sponsor, please make sure to email the logo file to sales@vastprintingaz.com"
    : ""
}
`;

    await transporter.sendMail({
      from: "anthonylisacki@gmail.com",
      to: data.email,
      subject: "Your Shirt Order Confirmation",
      text: customerText
    });

    res.json({ venmoLink, amount: totalAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// CSV download for admin
app.get("/admin/orders.csv", (req, res) => {
  res.download(CSV_FILE, "orders.csv");
});

app.listen(3000, () => console.log("Server running at http://localhost:3000"));
