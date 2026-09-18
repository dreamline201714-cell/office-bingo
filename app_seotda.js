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

		const month = card.month;
		const type = String(card.type || '').toUpperCase();
		const cardId = String(card.id || '').toLowerCase();
		
		let prefix = '';
		let suffix = '';

		// 1. 월별 접두사 매핑 (9월 국화, 11월 오동 등 정상 반영)
		switch (month) {
			case 1: prefix = '01_솔'; break;
			case 2: prefix = '02_매화'; break;
			case 3: prefix = '03_벚꽃'; break;
			case 4: prefix = '04_흑싸리'; break;
			case 5: prefix = '05_난초'; break;
			case 6: prefix = '06_모란'; break;
			case 7: prefix = '07_홍싸리'; break;
			case 8: prefix = '08_공산'; break;
			case 9: prefix = '09_국화'; break; 
			case 10: prefix = '10_단풍'; break;
			case 11: prefix = '11_오동'; break; 
			case 12: prefix = '12_비'; break;   
		}

		// 2. 섯다 덱 종류별 접미사 매핑
		if (type === 'KWANG') {
			suffix = '광'; 
		} else if (type === 'ANIMAL') {
			suffix = '열끗';
		} else if (type === 'RIBBON') {
			if (month === 7) suffix = '홍단'; 
			else if (month === 12) suffix = '초단';
			else if (month === 1 || month === 2 || month === 3) suffix = '홍단';
			else if (month === 6 || month === 9 || month === 10) suffix = '청단';
			else suffix = '초단';
		} else if (type === 'DOUBLE_PI') {
			if (month === 9) suffix = '피2';       
			else if (month === 11) suffix = '쌍피'; 
			else if (month === 12) suffix = '피';   
			else suffix = '쌍피';
		} else {
			// 일반 피
			if (cardId.includes('2') || cardId.includes('b')) suffix = '피2';
			else suffix = '피1';
		}

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
                const fullPath = window.location.pathname;
                const basePath = fullPath.substring(0, fullPath.lastIndexOf('/'));
                const shareUrl = `${window.location.origin}${basePath}/index.html?game=seotda&room=${currentRoomId}`;
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
                const fullPath = window.location.pathname;
                const basePath = fullPath.substring(0, fullPath.lastIndexOf('/'));
                const shareUrl = `${window.location.origin}${basePath}/index.html?game=seotda&room=${currentRoomId}`;
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

    function applyRoomInvite(code) {
        if (!code) return;
        code = String(code).trim().toUpperCase();

        const createTabBtn = document.getElementById('tab-btn-create');
        const joinTabBtn = document.getElementById('tab-btn-join');
        if (createTabBtn) createTabBtn.classList.remove('active');
        if (joinTabBtn) joinTabBtn.classList.add('active');

        const createForm = document.getElementById('create-room-form');
        const joinForm = document.getElementById('join-room-form');
        if (createForm) createForm.style.display = 'none';
        if (joinForm) joinForm.style.display = 'block';

        const joinCodeInput = document.getElementById('join-room-code');
        if (joinCodeInput) {
            joinCodeInput.value = code;
        }

        const joinNickInput = document.getElementById('join-nickname');
        if (joinNickInput && !joinNickInput.value) {
            joinNickInput.focus();
        }

        showToast(`초대받은 방 코드 [${code}]가 자동 입력되었습니다!`);
    }

    function checkUrlQueryParams() {
        let roomParam = new URLSearchParams(window.location.search).get('room');
        if (!roomParam && window.parent && window.parent !== window) {
            try {
                roomParam = new URLSearchParams(window.parent.location.search).get('room');
            } catch (e) {}
        }
        if (roomParam) {
            applyRoomInvite(roomParam);
        }
    }

    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'APPLY_ROOM_INVITE' && e.data.room) {
            applyRoomInvite(e.data.room);
        }
    });

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
            if (window.GameFX) {
                if (window.GameFX.mountDock) {
                    window.GameFX.mountDock(
                        (emoji) => sendMessage({ type: 'SEND_REACTION', room_id: currentRoomId, emoji: emoji }),
                        (text) => sendMessage({ type: 'QUICK_CHAT', room_id: currentRoomId, text: text })
                    );
                }
                if (window.GameFX.initTicker) {
                    window.GameFX.initTicker((text) => {
                        sendMessage({ type: 'CHAT_MESSAGE', room_id: currentRoomId, message: text });
                    });
                }
            }
        } else if (msg.type === 'STARTING_DRAW') {
            showTurnOrderDrawModal(msg.turn_order_list);
            setTimeout(() => {
                const drawModal = document.getElementById('draw-modal');
                if (drawModal) drawModal.classList.remove('active');
                roomState = msg.state;
                updateUI();
            }, 2500);
        } else if (msg.type === 'ROOM_UPDATED') {
            const oldStatus = roomState ? roomState.status : 'WAITING';
            roomState = msg.state;
            updateUI();

            // 쇼다운 전환 시 슬램 사운드 및 화면 흔들림 효과
            if (oldStatus === 'PLAYING' && roomState.status === 'SHOWDOWN') {
                if (window.GameFX) {
                    if (window.GameFX.audio) window.GameFX.audio.playSlam();
                    window.GameFX.shake(6, 300);
                }
            }
        } else if (msg.type === 'CHAT_MESSAGE') {
            if (roomState && msg.chat) {
                roomState.chat_logs.push(msg.chat);
                renderChatLogs();
            }
            if (window.GameFX) {
                GameFX.say(msg.chat.player_id || msg.chat.nickname, msg.chat.text);
                GameFX.ticker(msg.chat.text, msg.chat.nickname, msg.chat.system);
                GameFX.incrementUnread();
            }
        } else if (msg.type === 'FLOATING_REACTION') {
            if (window.GameFX) {
                if (window.GameFX.reactions) window.GameFX.reactions.spawn(msg.emoji, msg.nickname);
                GameFX.say(msg.player_id || msg.nickname, msg.emoji);
            }
        } else if (msg.type === 'QUICK_CHAT_BUBBLE') {
            if (window.GameFX) {
                GameFX.say(msg.player_id || msg.nickname, msg.text);
                GameFX.ticker(msg.text, msg.nickname);
                window.GameFX.reactions.spawn('💬', msg.nickname);
                if (window.GameFX.audio) window.GameFX.audio.playPop(850, 0.05);
                GameFX.incrementUnread();
            }
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
        document.getElementById('display-chips-info').innerText = `기본 판돈: ${(roomState.base_ante || 100).toLocaleString()}칩`;
        
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
                showToast(`🏆 라운드 종료! 우승자가 판돈 ${(roomState.pot || 0).toLocaleString()} 칩을 싹쓸이했습니다!`);
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

    let isSecondCardRevealed = false;

    function animateChipToss(originBtn) {
        const potEl = document.getElementById('pot-center-box') || document.querySelector('.pot-center-box');
        if (!potEl) return;

        const rectFrom = originBtn ? originBtn.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 100 };
        const rectTo = potEl.getBoundingClientRect();

        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                const chip = document.createElement('div');
                chip.className = 'flying-chip';
                chip.innerText = '🪙';
                chip.style.left = `${rectFrom.left + (Math.random() - 0.5) * 40}px`;
                chip.style.top = `${rectFrom.top + (Math.random() - 0.5) * 20}px`;
                document.body.appendChild(chip);

                if (window.GameFX && window.GameFX.audio) {
                    window.GameFX.audio.playChip(1.0 + i * 0.15);
                }

                requestAnimationFrame(() => {
                    chip.style.left = `${rectTo.left + rectTo.width / 2 + (Math.random() - 0.5) * 30}px`;
                    chip.style.top = `${rectTo.top + rectTo.height / 2 + (Math.random() - 0.5) * 20}px`;
                    chip.style.transform = 'scale(0.8) rotate(360deg)';
                    chip.style.opacity = '0.9';
                });

                setTimeout(() => {
                    chip.remove();
                    potEl.classList.remove('pot-bounce');
                    void potEl.offsetWidth;
                    potEl.classList.add('pot-bounce');
                }, 460);
            }, i * 85);
        }
    }

    function renderMyHand(myPlayer) {
        const cardsBox = document.getElementById('my-cards-container');
        const jokboBadge = document.getElementById('my-jokbo-badge');
        if (!cardsBox) return;

        cardsBox.innerHTML = '';
        const hand = myPlayer.hand || [];

        if (hand.length === 0) {
            isSecondCardRevealed = false;
            cardsBox.innerHTML = '<div class="hwatu-card card-back"></div><div class="hwatu-card card-back"></div>';
            if (jokboBadge) jokboBadge.innerText = '패 대기 중...';
            return;
        }

        // 1번째 패: 기본 오픈
        const card1 = hand[0];
        const div1 = document.createElement('div');
        div1.className = `hwatu-card theme-${currentCardTheme} ${card1.is_kwang ? 'kwang' : 'pi'}`;
        if (currentCardTheme === 'classic') {
            const imgPath = getSeotdaCardImgPath(card1);
            div1.innerHTML = `<img src="${imgPath}" alt="${card1.month}월" class="card-img">`;
        } else {
            div1.innerHTML = `
                <div class="card-top">
                    <span class="card-month">${card1.month}월</span>
                    <span class="card-badge">${card1.is_kwang ? '광' : '피'}</span>
                </div>
                <div class="card-icon">${card1.is_kwang ? '☀' : '🍃'}</div>
                <div class="card-name-sub">${card1.name || ''}</div>
            `;
        }
        cardsBox.appendChild(div1);

        // 2번째 패: 전설의 '패 쪼기 (Card Squeeze)' 모드
        if (hand.length >= 2) {
            const card2 = hand[1];
            const squeezeContainer = document.createElement('div');
            squeezeContainer.className = 'squeeze-container';

            const div2 = document.createElement('div');
            div2.className = `hwatu-card theme-${currentCardTheme} ${card2.is_kwang ? 'kwang' : 'pi'}`;
            if (currentCardTheme === 'classic') {
                const imgPath = getSeotdaCardImgPath(card2);
                div2.innerHTML = `<img src="${imgPath}" alt="${card2.month}월" class="card-img">`;
            } else {
                div2.innerHTML = `
                    <div class="card-top">
                        <span class="card-month">${card2.month}월</span>
                        <span class="card-badge">${card2.is_kwang ? '광' : '피'}</span>
                    </div>
                    <div class="card-icon">${card2.is_kwang ? '☀' : '🍃'}</div>
                    <div class="card-name-sub">${card2.name || ''}</div>
                `;
            }
            squeezeContainer.appendChild(div2);

            const coverCard = document.createElement('div');
            coverCard.className = `squeeze-cover-card ${isSecondCardRevealed ? 'revealed' : ''}`;
            coverCard.innerHTML = `
                <span>🎴</span>
                <span class="squeeze-guide-badge">👆 밀어서 쪼기!</span>
            `;

            const revealCard = () => {
                if (isSecondCardRevealed) return;
                isSecondCardRevealed = true;
                coverCard.classList.add('revealed');
                if (window.GameFX && window.GameFX.audio) {
                    window.GameFX.audio.playSlam();
                }
                if (jokboBadge) {
                    jokboBadge.innerText = myPlayer.jokbo_name || '확인 완료';
                }
                const jokbo = myPlayer.jokbo_name || '';
                if (jokbo.includes('광땡') || jokbo.includes('장땡') || jokbo.includes('땡') || jokbo.includes('암행어사') || jokbo.includes('알리')) {
                    if (window.GameFX) {
                        window.GameFX.cutIn(`🔥 ${jokbo} 완성!`, `${myPlayer.nickname}님의 승부패!`, '#f59e0b');
                        window.GameFX.shake(8, 400);
                    }
                }
            };

            coverCard.addEventListener('click', (e) => {
                e.stopPropagation();
                revealCard();
            });

            let startY = 0;
            coverCard.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
            }, { passive: true });
            coverCard.addEventListener('touchmove', (e) => {
                const diff = startY - e.touches[0].clientY;
                if (diff > 20) revealCard();
            }, { passive: true });

            squeezeContainer.appendChild(coverCard);
            cardsBox.appendChild(squeezeContainer);

            if (!isSecondCardRevealed) {
                const quickBtn = document.createElement('button');
                quickBtn.type = 'button';
                quickBtn.className = 'quick-reveal-btn';
                quickBtn.innerText = '⚡ 한번에 까기';
                quickBtn.onclick = (e) => {
                    e.stopPropagation();
                    revealCard();
                    quickBtn.remove();
                };
                cardsBox.appendChild(quickBtn);
            }
        }

        if (jokboBadge) {
            jokboBadge.innerText = isSecondCardRevealed ? (myPlayer.jokbo_name || '패 대기 중...') : '??? (쪼기 진행 중)';
        }
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
					let card1Html = '';
					let card2Html = '';

					// 테마에 맞추어 카드 2장을 렌더링
					[hand[0], hand[1]].forEach((card, idx) => {
						const typeClass = card.is_kwang ? 'kwang' : 'pi';
						let inner = '';
						
						if (currentCardTheme === 'classic') {
							const imgPath = getSeotdaCardImgPath(card);
							inner = `<img src="${imgPath}" alt="${card.month}월" class="card-img" onerror="this.onerror=null; this.parentElement.classList.remove('theme-classic'); this.parentElement.classList.add('theme-notion'); this.parentElement.innerHTML='<div class=\\'card-top\\'><span class=\\'card-month\\'>${card.month}월</span></div><div class=\\'card-icon\\'>🍃</div>';">`;
						} else {
							inner = `
								<div class="card-top"><span class="card-month">${card.month}월</span><span class="card-badge">${card.is_kwang ? '광' : '피'}</span></div>
								<div class="card-icon">${card.is_kwang ? '☀' : '🍃'}</div>
							`;
						}
						
						const fullCardHtml = `<div class="hwatu-card theme-${currentCardTheme} ${typeClass}">${inner}</div>`;
						if(idx === 0) card1Html = fullCardHtml;
						if(idx === 1) card2Html = fullCardHtml;
					});

					cardsHtml = `<div class="table-hwatu-container">${card1Html}${card2Html}</div>`;
				}
			} else if (roomState.status === 'PLAYING' && !p.is_folded) {
				// 게임 진행 중일 때는 덮어둔 뒷면 카드 표시 (테마 연동)
				cardsHtml = `
					<div class="table-hwatu-container">
						<div class="hwatu-card theme-${currentCardTheme} card-back"></div>
						<div class="hwatu-card theme-${currentCardTheme} card-back"></div>
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
            card.className = 'player-card speech-bubble-anchor';
            card.setAttribute('data-player-id', p.player_id);
            
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

    initMobileSidebar();
    initNavControls();
    initShareControls();
    initActionEvents();
    checkUrlQueryParams();
    connectNetwork();
})();