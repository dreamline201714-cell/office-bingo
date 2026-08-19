/**
 * Office Seotda Live Client Application Logic - Shared Hwatu Card Rendering
 */

(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let roomState = null;
    let soundEnabled = true;
    let currentTheme = 'light';
    let previousTurnPlayerId = null;
    let previousStatus = null;
	let currentCardTheme = localStorage.getItem('hwatu_card_theme') || 'notion';

	function setCardTheme(themeName) {
		currentCardTheme = themeName;
		localStorage.setItem('hwatu_card_theme', themeName);
		updateUI();
		showToast(themeName === 'classic' ? '🎴 레트로 화투패로 변경되었습니다.' : '🎨 노션 모던 화투패로 변경되었습니다.');
	}

	// 깃허브 Raw URL 섯다 패 매핑 함수
	function getSeotdaCardImgPath(card) {
		if (!card) return '';
		const baseUrl = "https://raw.githubusercontent.com/dreamline201714-cell/2026-02-15-hwatu-card-image-extraction/master/hwatu_cards";

		const monthNames = {
			1: '01_솔', 2: '02_매화', 3: '03_벚꽃', 4: '04_흑싸리',
			5: '05_난초', 6: '06_모란', 7: '07_홍싸리', 8: '08_공산',
			9: '09_국진', 10: '10_단풍', 11: '11_오동', 12: '12_비'
		};
		
		const prefix = monthNames[card.month];
		const suffix = card.is_kwang ? '광' : '피1';

		const fileName = encodeURIComponent(`${prefix}_${suffix}.png`);
		return `${baseUrl}/${fileName}`;
	}


    function animateChipToss(fromBtnEl) {
        const potBox = document.getElementById('pot-center-box');
        if (!fromBtnEl || !potBox) return;

        const startRect = fromBtnEl.getBoundingClientRect();
        const endRect = potBox.getBoundingClientRect();

        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                const chip = document.createElement('div');
                chip.className = 'flying-chip';
                chip.style.left = `${startRect.left + startRect.width / 2}px`;
                chip.style.top = `${startRect.top + startRect.height / 2}px`;
                document.body.appendChild(chip);

                requestAnimationFrame(() => {
                    chip.style.left = `${endRect.left + endRect.width / 2 + (Math.random() * 20 - 10)}px`;
                    chip.style.top = `${endRect.top + endRect.height / 2 + (Math.random() * 20 - 10)}px`;
                    chip.style.transform = 'scale(0.8) rotate(360deg)';
                });

                setTimeout(() => {
                    if (chip.parentNode) chip.parentNode.removeChild(chip);
                }, 650);
            }, i * 80);
        }
    }

    function animatePotSweepToWinner(winnerPlayerId) {
        const potBox = document.getElementById('pot-center-box');
        if (!potBox) return;

        let targetEl = (String(winnerPlayerId) === String(myPlayerId))
            ? document.querySelector('.my-seotda-hand-panel')
            : (document.querySelectorAll('.player-seat-card')[0] || potBox);

        if (!targetEl) return;

        const startRect = potBox.getBoundingClientRect();
        const endRect = targetEl.getBoundingClientRect();

        for (let i = 0; i < 12; i++) {
            setTimeout(() => {
                const chip = document.createElement('div');
                chip.className = 'flying-chip';
                chip.style.left = `${startRect.left + startRect.width / 2 + (Math.random() * 30 - 15)}px`;
                chip.style.top = `${startRect.top + startRect.height / 2 + (Math.random() * 30 - 15)}px`;
                document.body.appendChild(chip);

                requestAnimationFrame(() => {
                    chip.style.left = `${endRect.left + endRect.width / 2}px`;
                    chip.style.top = `${endRect.top + endRect.height / 2}px`;
                    chip.style.transform = 'scale(0.4) rotate(720deg)';
                    chip.style.opacity = '0.2';
                });

                setTimeout(() => {
                    if (chip.parentNode) chip.parentNode.removeChild(chip);
                }, 700);
            }, i * 50);
        }
    }

    function initStealthMode() {
        const btnStealthToggle = document.getElementById('btn-stealth-toggle');
        const stealthOpacityBox = document.getElementById('stealth-opacity-box');
        const stealthOpacityRange = document.getElementById('stealth-opacity-range');
        const brandTitleEl = document.getElementById('brand-title-el');
        const brandIconEl = document.getElementById('brand-icon-el');

        if (btnStealthToggle) {
            btnStealthToggle.onclick = function (e) {
                e.preventDefault();
                document.body.classList.toggle('excel-stealth-mode');
                const isStealth = document.body.classList.contains('excel-stealth-mode');

                if (stealthOpacityBox) stealthOpacityBox.style.display = isStealth ? 'flex' : 'none';

                if (isStealth) {
                    if (brandIconEl) brandIconEl.innerText = '📊';
                    if (brandTitleEl) brandTitleEl.innerHTML = '26년 재무상태표.xlsx <small style="font-size:0.65rem; color:#fff; vertical-align:super;">- Excel</small>';
                } else {
                    document.body.style.opacity = '1';
                    if (stealthOpacityRange) stealthOpacityRange.value = '100';
                    if (brandIconEl) brandIconEl.innerText = '🃏';
                    if (brandTitleEl) brandTitleEl.innerHTML = 'Office Seotda <small style="font-size:0.65rem; color:var(--border-accent); vertical-align:super;">LIVE</small>';
                }
            };
        }

        if (stealthOpacityRange) {
            stealthOpacityRange.oninput = function (e) {
                document.body.style.opacity = (e.target.value / 100).toString();
            };
        }
    }

    function initMobileSidebar() {
        const mobileFabBtn = document.getElementById('mobile-fab-btn');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

        if (mobileFabBtn && mobileSidebar) {
            mobileFabBtn.onclick = () => mobileSidebar.classList.add('active');
        }
        if (mobileSidebarClose && mobileSidebar) {
            mobileSidebarClose.onclick = () => mobileSidebar.classList.remove('active');
        }
    }

    function initNavControls() {
        const btnHelp = document.getElementById('btn-help');
        const helpModal = document.getElementById('help-modal');
        const helpModalClose = document.getElementById('help-modal-close');
        const soundToggleBtn = document.getElementById('sound-toggle-btn');
        const themeToggleBtn = document.getElementById('theme-toggle-btn');

        if (btnHelp && helpModal) btnHelp.onclick = () => helpModal.classList.add('active');
        if (helpModalClose && helpModal) helpModalClose.onclick = () => helpModal.classList.remove('active');

        if (soundToggleBtn) {
            soundToggleBtn.onclick = () => {
                soundEnabled = !soundEnabled;
                soundToggleBtn.innerText = soundEnabled ? '🔊' : '🔇';
                showToast(soundEnabled ? '사운드가 켜졌습니다.' : '사운드가 꺼졌습니다.');
            };
        }

        if (themeToggleBtn) {
            themeToggleBtn.onclick = () => {
                currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);
                document.body.setAttribute('data-theme', currentTheme);
                themeToggleBtn.innerText = (currentTheme === 'dark') ? '☀️' : '🌙';
                showToast(currentTheme === 'dark' ? '다크 모드로 변경되었습니다.' : '라이트 모드로 변경되었습니다.');
            };
        }
    }

    function initShareControls() {
        const btnCopyLink = document.getElementById('btn-copy-link');
        const btnShowQr = document.getElementById('btn-show-qr');
        const qrModal = document.getElementById('qr-modal');
        const qrModalClose = document.getElementById('qr-modal-close');
        const qrCodeContainer = document.getElementById('qrcode');

        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const shareUrl = `${window.location.origin}/index.html?game=seotda&room=${currentRoomId}`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!'))
                    .catch(() => prompt('아래 링크를 복사하세요:', shareUrl));
                } else {
                    prompt('아래 링크를 복사하세요:', shareUrl);
                }
            };
        }

        if (btnShowQr) {
            btnShowQr.onclick = () => {
                const shareUrl = `${window.location.origin}/index.html?game=seotda&room=${currentRoomId}`;
                if (qrCodeContainer) {
                    qrCodeContainer.innerHTML = '';
                    if (typeof QRCode === 'function') {
                        new QRCode(qrCodeContainer, { text: shareUrl, width: 180, height: 180 });
                    } else {
                        qrCodeContainer.innerText = shareUrl;
                    }
                }
                if (qrModal) qrModal.classList.add('active');
            };
        }

        if (qrModalClose && qrModal) {
            qrModalClose.onclick = () => qrModal.classList.remove('active');
        }
    }

    function showTurnOrderDrawModal(turnOrderList) {
        const listContainer = document.getElementById('draw-result-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        if (turnOrderList) {
            turnOrderList.forEach(item => {
                const card = document.createElement('div');
                card.className = 'player-card';
                card.innerHTML = `<span>● ${escapeHtml(item.nickname)}</span><span>${item.rank}번째 턴 🎯</span>`;
                listContainer.appendChild(card);
            });
        }
        const drawModal = document.getElementById('draw-modal');
        if (drawModal) drawModal.classList.add('active');
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
    }

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            const joinTabBtn = document.getElementById('tab-btn-join');
            if (joinTabBtn) joinTabBtn.click();
            const joinCodeInput = document.getElementById('join-room-code');
            if (joinCodeInput) joinCodeInput.value = roomParam.toUpperCase();
        }
    }

    function connectNetwork() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        socket.onopen = () => { 
            const statusEl = document.getElementById('status-text');
            if(statusEl) statusEl.innerText = '연결됨'; 
            checkUrlQueryParams();
        };
        socket.onmessage = (e) => {
            try { handleServerMessage(JSON.parse(e.data)); } catch (err) { console.error(err); }
        };
        socket.onclose = () => {
            const statusEl = document.getElementById('status-text');
            if(statusEl) statusEl.innerText = '연결 끊김';
            setTimeout(connectNetwork, 2000);
        };
    }

    function handleServerMessage(msg) {
        if (msg.type === 'ROOM_JOINED') {
            currentRoomId = msg.room_id;
            myPlayerId = msg.player_id;
            roomState = msg.state;
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('arena-section').style.display = 'block';
            updateUI();
        } else if (msg.type === 'STARTING_DRAW') {
            showTurnOrderDrawModal(msg.turn_order_list);
            setTimeout(() => {
                const drawModal = document.getElementById('draw-modal');
                if (drawModal) drawModal.classList.remove('active');
                roomState = msg.state;
                updateUI();
            }, 2500);
        } else if (msg.type === 'ROOM_UPDATED') {
            roomState = msg.state;
            updateUI();
        } else if (msg.type === 'CHAT_MESSAGE') {
            if (roomState && msg.chat) {
                roomState.chat_logs.push(msg.chat);
                renderChatLogs();
            }
        } else if (msg.type === 'ERROR') {
            showToast(msg.message || '오류가 발생했습니다.');
        }
    }

    function updateUI() {
        if (!roomState) return;

        const status = roomState.status;
        const myPlayer = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
        const hostBtn = document.getElementById('btn-host-start');
        const readyBtn = document.getElementById('btn-toggle-ready');
        const roomBadge = document.getElementById('room-state-badge');
        const turnBanner = document.getElementById('turn-banner');
        const hostControls = document.getElementById('host-controls');
        const dealerControls = document.getElementById('dealer-controls');
        const betGroup = document.getElementById('betting-action-group');
        const turnPlayerBadge = document.getElementById('turn-player-badge');

        document.getElementById('display-room-code').innerText = roomState.room_id;
        document.getElementById('total-pot-amount').innerText = `${(roomState.pot || 0).toLocaleString()} 칩`;
        document.getElementById('display-chips-info').innerText = `시작 자금: ${(roomState.start_chips || 10000).toLocaleString()}칩 | 기본 판돈: ${(roomState.base_ante || 100).toLocaleString()}칩`;
        
        const titleEl = document.getElementById('display-topic-title');
        if (titleEl && roomState.title) titleEl.innerText = roomState.title;

        if (status === 'WAITING') {
            if (roomBadge) { roomBadge.className = 'room-state-badge waiting'; roomBadge.innerText = '대기 중'; }
            if (turnBanner) turnBanner.style.display = 'none';
            if (dealerControls) dealerControls.style.display = 'none';
            if (betGroup) betGroup.style.display = 'none';

            if (myPlayer) {
                if (readyBtn) {
                    readyBtn.style.display = 'inline-block';
                    readyBtn.innerText = myPlayer.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
                }

                if (hostControls) {
                    if (myPlayer.is_host) {
                        hostControls.style.display = 'flex';
                        if (hostBtn) {
                            const allReady = roomState.players.every(p => p.is_ready);
                            hostBtn.disabled = !allReady;
                            hostBtn.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                        }
                    } else {
                        hostControls.style.display = 'none';
                    }
                }
            }
        } 
        else if (status === 'SHOWDOWN') {
            if (roomBadge) { roomBadge.className = 'room-state-badge waiting'; roomBadge.innerText = '결과 공개 중'; }
            if (turnBanner) turnBanner.style.display = 'none';
            if (hostControls) hostControls.style.display = 'none';
            if (readyBtn) readyBtn.style.display = 'none';
            if (betGroup) betGroup.style.display = 'none';

            if (dealerControls) {
                if (myPlayerId && String(myPlayerId) === String(roomState.dealer_player_id)) {
                    dealerControls.style.display = 'flex';
                } else {
                    dealerControls.style.display = 'none';
                }
            }

            if (previousStatus !== 'SHOWDOWN') {
                const winnerId = roomState.dealer_player_id;
                animatePotSweepToWinner(winnerId);

                const isStealth = document.body.classList.contains('excel-stealth-mode');
                if (isStealth) {
                    const formulaInput = document.querySelector('.excel-formula-input');
                    if (formulaInput) {
                        formulaInput.value = `=PROFIT_JACKPOT(+${(roomState.pot || 0).toLocaleString()}_CHIPS)`;
                    }
                } else {
                    showToast(`🏆 라운드 종료! 우승자가 판돈 ${(roomState.pot || 0).toLocaleString()} 칩을 싹쓸이했습니다!`);
                }
            }
        } 
        else {
            if (roomBadge) { roomBadge.className = 'room-state-badge playing'; roomBadge.innerText = '배팅 진행 중'; }
            if (turnBanner) turnBanner.style.display = 'flex';
            if (hostControls) hostControls.style.display = 'none';
            if (dealerControls) dealerControls.style.display = 'none';
            if (readyBtn) readyBtn.style.display = 'none';
            
            if (betGroup) {
                betGroup.style.display = myPlayer?.is_folded ? 'none' : 'flex';
            }

            const isMyTurn = (String(myPlayerId) === String(roomState.current_turn_player_id));
            const turnPlayer = roomState.players.find(p => String(p.player_id) === String(roomState.current_turn_player_id));

            if (turnPlayerBadge) {
                turnPlayerBadge.innerText = isMyTurn ? `내 턴입니다! (${myPlayer?.nickname})` : `${turnPlayer?.nickname || '참여자'}님 배팅 중`;
            }

            if (String(roomState.current_turn_player_id) === String(myPlayerId) && String(previousTurnPlayerId) !== String(myPlayerId)) {
                showToast("🃏 당신의 배팅 턴입니다! 배팅을 선택하세요!");
            }
            previousTurnPlayerId = roomState.current_turn_player_id;
        }
        
        previousStatus = status;

        if (myPlayer) renderMyHand(myPlayer);
        renderOtherPlayers();
        renderPlayers();
        renderChatLogs();
    }

    function renderMyHand(myPlayer) {
        const cardsBox = document.getElementById('my-cards-container');
        const jokboBadge = document.getElementById('my-jokbo-badge');
        if (!cardsBox) return;

        cardsBox.innerHTML = '';
        const hand = myPlayer.hand || [];

        if (jokboBadge) {
            jokboBadge.innerText = myPlayer.jokbo_name || '패 대기 중...';
        }

        if (hand.length === 0) {
            cardsBox.innerHTML = '<div class="hwatu-card card-back"></div><div class="hwatu-card card-back"></div>';
            return;
        }

        hand.forEach((card) => {
            const div = document.createElement('div');
            const typeClass = card.is_kwang ? 'kwang' : 'pi';
            div.className = `hwatu-card theme-${currentCardTheme} ${typeClass}`;

            if (currentCardTheme === 'classic') {
                const imgPath = getSeotdaCardImgPath(card);
                div.innerHTML = `<img src="${imgPath}" alt="${card.month}월" class="card-img">`;
            } else {
                div.innerHTML = `
                    <div class="card-top">
                        <span class="card-month">${card.month}월</span>
                        <span class="card-badge">${card.is_kwang ? '광' : '피'}</span>
                    </div>
                    <div class="card-icon">${card.is_kwang ? '☀' : '🍃'}</div>
                    <div class="card-name-sub">${card.name || ''}</div>
                `;
            }
            cardsBox.appendChild(div);
        });
    }

    function renderOtherPlayers() {
        const container = document.getElementById('other-players-grid');
        if (!container || !roomState) return;
        container.innerHTML = '';

        roomState.players.forEach(p => {
            if (String(p.player_id) === String(myPlayerId)) return;
            const div = document.createElement('div');
            div.className = 'player-seat-card';
            
            let statusText = p.is_folded ? '😭 다이' : '배팅 중';
            let cardsHtml = '';

            if (roomState.status === 'SHOWDOWN' && !p.is_folded) {
                statusText = `<span style="color:var(--border-accent); font-weight:bold;">${p.jokbo_name}</span>`;
                const hand = p.hand || [];
                if (hand.length >= 2) {
                    cardsHtml = `
                        <div class="table-hwatu-container">
                            <div class="hwatu-card ${hand[0].is_kwang ? 'kwang' : 'pi'}">
                                <div class="card-top"><span class="card-month">${hand[0].month}월</span><span class="card-badge">${hand[0].is_kwang ? '광' : '피'}</span></div>
                                <div class="card-icon">${hand[0].is_kwang ? '☀' : '🍃'}</div>
                            </div>
                            <div class="hwatu-card ${hand[1].is_kwang ? 'kwang' : 'pi'}">
                                <div class="card-top"><span class="card-month">${hand[1].month}월</span><span class="card-badge">${hand[1].is_kwang ? '광' : '피'}</span></div>
                                <div class="card-icon">${hand[1].is_kwang ? '☀' : '🍃'}</div>
                            </div>
                        </div>
                    `;
                }
            } else if (roomState.status === 'PLAYING' && !p.is_folded) {
                cardsHtml = `
                    <div class="table-hwatu-container">
                        <div class="hwatu-card card-back"></div>
                        <div class="hwatu-card card-back"></div>
                    </div>
                `;
            }

            const isWinner = (roomState.status === 'SHOWDOWN' && String(p.player_id) === String(roomState.dealer_player_id));

            div.innerHTML = `
                <div class="seat-player-name">
                    ${isWinner ? '👑 ' : ''}${escapeHtml(p.nickname)}
                </div>
                <div class="seat-player-chips">${(p.chips || 0).toLocaleString()} 칩</div>
                ${cardsHtml}
                <div class="seat-player-status">${statusText}</div>
            `;
            container.appendChild(div);
        });
    }

    function renderPlayers() {
        const panel = document.getElementById('panel-players');
        const countSpan = document.getElementById('player-count');
        const mobilePlayerCount = document.getElementById('mobile-player-count');
        if (!panel || !roomState) return;

        panel.innerHTML = '';
        if (countSpan) countSpan.innerText = roomState.players.length;
        if (mobilePlayerCount) mobilePlayerCount.innerText = roomState.players.length;

        roomState.players.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            let statusHtml = '';
            if (roomState.status === 'WAITING') {
                statusHtml = p.is_ready ? '<span class="ready-tag ready">준비 완료</span>' : '<span class="ready-tag waiting">작성 중...</span>';
            } else if (roomState.status === 'SHOWDOWN') {
                statusHtml = String(p.player_id) === String(roomState.dealer_player_id) ? '<span style="font-size:0.75rem; font-weight:bold; color:var(--border-accent);">👑 승자(선)</span>' : '<span style="font-size:0.75rem; color:var(--text-secondary);">대기 중</span>';
            } else {
                statusHtml = p.is_folded ? '<span style="font-size:0.7rem; color:var(--text-muted);">다이</span>' : '<span style="font-size:0.7rem; font-weight:bold; color:var(--border-accent);">생존</span>';
            }

            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${p.color};">${p.nickname.charAt(0)}</div>
                    <div class="player-name">${escapeHtml(p.nickname)} ${p.is_host ? '<span class="host-tag">방장</span>' : ''}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${statusHtml}
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:bold;">${(p.chips || 0).toLocaleString()} 칩</span>
                </div>
            `;
            panel.appendChild(card);
        });
    }

    function renderChatLogs() {
        const chatBox = document.getElementById('chat-messages');
        if (!chatBox || !roomState) return;
        chatBox.innerHTML = '';
        (roomState.chat_logs || []).forEach(chat => {
            if (chat.system) return;
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.innerHTML = `<span class="sender" style="color:${chat.color}">${escapeHtml(chat.nickname)}:</span> <span>${escapeHtml(chat.text)}</span>`;
            chatBox.appendChild(msgEl);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

    function initActionEvents() {
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        if (btnToggleReady) {
            btnToggleReady.onclick = () => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'TOGGLE_READY', room_id: currentRoomId }));
                }
            };
        }

        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.getAttribute('data-action');
                if (action !== 'DIE') animateChipToss(e.target);
                if (socket) socket.send(JSON.stringify({ type: 'SEOTDA_BET', room_id: currentRoomId, action: action }));
            });
        });

        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const msg = e.target.getAttribute('data-msg');
                if (msg && socket) socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', room_id: currentRoomId, message: msg, quick_voice: true }));
            });
        });

        const createTabBtn = document.getElementById('tab-btn-create');
        const joinTabBtn = document.getElementById('tab-btn-join');
        const createForm = document.getElementById('create-room-form');
        const joinForm = document.getElementById('join-room-form');

        if (createTabBtn && joinTabBtn) {
            createTabBtn.addEventListener('click', () => {
                createTabBtn.classList.add('active'); joinTabBtn.classList.remove('active');
                if (createForm) createForm.style.display = 'block';
                if (joinForm) joinForm.style.display = 'none';
            });
            joinTabBtn.addEventListener('click', () => {
                joinTabBtn.classList.add('active'); createTabBtn.classList.remove('active');
                if (joinForm) joinForm.style.display = 'block';
                if (createForm) createForm.style.display = 'none';
            });
        }

        const hostStartBtn = document.getElementById('btn-host-start');
        if (hostStartBtn) {
            hostStartBtn.onclick = () => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'START_GAME', room_id: currentRoomId }));
                }
            };
        }

        const dealerStartBtn = document.getElementById('btn-dealer-start');
        if (dealerStartBtn) {
            dealerStartBtn.onclick = () => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'START_ROUND', room_id: currentRoomId }));
                }
            };
        }

        document.getElementById('create-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const customTitle = document.getElementById('create-title').value.trim() || '사내 실시간 섯다';
            const startChips = parseInt(document.getElementById('create-start-chips').value) || 10000;
            const baseAnte = parseInt(document.getElementById('create-base-ante').value) || 100;
            
            socket.send(JSON.stringify({
                type: 'CREATE_ROOM', game_type: 'SEOTDA',
                title: customTitle,
                nickname: document.getElementById('create-nickname').value,
                start_chips: startChips,
                base_ante: baseAnte
            }));
        });

        document.getElementById('join-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            socket.send(JSON.stringify({
                type: 'JOIN_ROOM', nickname: document.getElementById('join-nickname').value,
                room_id: document.getElementById('join-room-code').value
            }));
        });

        document.getElementById('chat-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            if (input.value.trim() && socket) {
                socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', room_id: currentRoomId, message: input.value.trim() }));
                input.value = '';
            }
        });
    }

    initStealthMode();
    initMobileSidebar();
    initNavControls();
    initShareControls();
    initActionEvents();
    connectNetwork();
})();