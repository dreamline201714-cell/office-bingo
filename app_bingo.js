/**
 * Office Bingo Live Client Application Logic - Fully Fixed & Cleaned
 */

(function () {
    // ==========================================
    // 💾 오늘 하루 전적 로컬스토리지 안전 엔진
    // ==========================================
    var TODAY_STATS_KEY = 'office_bingo_today_stats';

    function getTodayString() {
        return new Date().toISOString().slice(0, 10);
    }

    function getTodayStats() {
        try {
            var raw = localStorage.getItem(TODAY_STATS_KEY);
            var today = getTodayString();
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && parsed.date === today) return parsed;
            }
        } catch (e) {
            console.warn("로컬스토리지 읽기 에러:", e);
        }
        return { date: getTodayString(), wins: 0, loses: 0 };
    }

    async function recordTodayResult(isWin, isLoser) {
		try {
			var stats = getTodayStats();
			if (isWin) stats.wins += 1;
			if (isLoser) stats.loses += 1;
			
			// 1. 로컬스토리지에 최신 승수 저장
			localStorage.setItem(TODAY_STATS_KEY, JSON.stringify(stats));

			const nickname = localStorage.getItem('office_bingo_last_nickname') || '참여자';
			const today = getTodayString();

			// 2. 승리했을 때만 DB에 기록 전송 (또는 최신 stats.wins 값 반영)
			if (isWin) {
				await fetch('https://clsavoupapzxeyfybevr.supabase.co/rest/v1/daily_stats', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsc2F2b3VwYXB6eGV5ZnliZXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjcyOTUsImV4cCI6MjEwMjM0MzI5NX0.EYVZ2y0BnN4of-6KhFemarxZFFwBeTvAX-k-1gTCWbI',
						'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsc2F2b3VwYXB6eGV5ZnliZXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjcyOTUsImV4cCI6MjEwMjM0MzI5NX0.EYVZ2y0BnN4of-6KhFemarxZFFwBeTvAX-k-1gTCWbI',
						'Prefer': 'return=minimal'
					},
					body: JSON.stringify({
						game_type: 'BINGO',
						nickname: nickname,
						play_date: today,
						wins: stats.wins // ★ 계산이 완료된 최신 stats.wins 전송
					})
				});
			}
		} catch (e) {
			console.warn("데이터베이스 전송 오류:", e);
		}
	}

    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let soundEnabled = true;
    let currentTheme = 'light';
    let previousTurnPlayerId = null;

    let roomState = null;
    let selectedSize = 5;
    let selectedGameMode = 'LOSER'; // 빙고 전용 모드: 🏃‍♂️ 탈출 레이스 (1등 탈출 우승 & 꼴찌 벌칙)
    let spectatingPlayerId = null;
    let configModalSelectedSize = 5;
    let configModalSelectedMode = 'LOSER';

    let timerInterval = null;
    let timerSecondsLeft = 15;
    let gameOverTimerInterval = null;
    let gameOverSecondsLeft = 15;

    function fireConfetti() {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    }



    function initMobileSidebar() {
        const mobileFabBtn = document.getElementById('mobile-fab-btn');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

        if (mobileFabBtn && mobileSidebar) mobileFabBtn.onclick = () => mobileSidebar.classList.add('active');
        if (mobileSidebarClose && mobileSidebar) mobileSidebarClose.onclick = () => mobileSidebar.classList.remove('active');
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

    function initPresetSelects() {
        const createSelect = document.getElementById('create-preset-select');
        const configSelect = document.getElementById('config-preset-select');

        const presets = (typeof BINGO_PRESETS !== 'undefined' && Array.isArray(BINGO_PRESETS))
            ? BINGO_PRESETS
            : [{ id: "custom", title: "✨ 자유 주제 (직접 입력)", words: [] }];

        function buildSelectOptions(selectEl, isConfig) {
            if (!selectEl) return;
            selectEl.innerHTML = '';

            presets.forEach(preset => {
                const opt = document.createElement('option');
                opt.value = preset.id;
                opt.innerText = preset.title;
                selectEl.appendChild(opt);
            });

            selectEl.onchange = (e) => {
                const selectedId = e.target.value;
                const selectedPreset = presets.find(p => p.id === selectedId);

                const topicInput = document.getElementById(isConfig ? 'config-topic-input' : 'create-topic');
                const wordsInput = document.getElementById(isConfig ? 'config-words-input' : 'create-words');

                if (!selectedPreset || selectedPreset.id === 'custom') {
                    if (topicInput) topicInput.value = '자유 주제';
                    if (wordsInput) wordsInput.value = '';
                } else {
                    if (topicInput) topicInput.value = selectedPreset.title.replace(/^[^\s]+\s+/, '');
                    if (wordsInput) wordsInput.value = (selectedPreset.words || []).join('\n');
                }
            };
        }

        buildSelectOptions(createSelect, false);
        buildSelectOptions(configSelect, true);
    }

    function updateTargetLinesOptions(size, selectEl) {
        if (!selectEl) return;
        const maxLines = (size * 2) + 2;
        selectEl.innerHTML = '';
        for (let i = 1; i <= maxLines; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = (i === maxLines) ? `${i} 줄 전체 완성 (올빙고 탈출)` : `${i} 줄 완성 시 탈출`;
            if (i === size) opt.selected = true;
            selectEl.appendChild(opt);
        }
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

        const tabBtnCreate = document.getElementById('tab-btn-create');
        const tabBtnJoin = document.getElementById('tab-btn-join');
        if (tabBtnCreate) tabBtnCreate.classList.remove('active');
        if (tabBtnJoin) tabBtnJoin.classList.add('active');

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
            const statusText = document.getElementById('status-text');
            const statusDot = document.getElementById('status-dot');
            if (statusText) statusText.innerText = '서버 연결됨';
            if (statusDot) statusDot.className = 'status-dot connected';
            checkUrlQueryParams();
        };

        socket.onmessage = (event) => {
            try { handleServerMessage(JSON.parse(event.data)); } catch (e) { console.error(e); }
        };

        socket.onclose = () => {
            const statusText = document.getElementById('status-text');
            const statusDot = document.getElementById('status-dot');
            if (statusText) statusText.innerText = '서버 연결 끊김';
            if (statusDot) statusDot.className = 'status-dot';
            setTimeout(connectNetwork, 2000);
        };
    }

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        } else {
            showToast('서버 연결 중입니다.');
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
        document.getElementById('draw-modal').classList.add('active');
    }

    function triggerStampAnimation(text, isLoser) {
        const overlay = document.getElementById('office-stamp-overlay');
        const box = document.getElementById('office-stamp-box');
        if (!overlay || !box) return;

        box.className = 'office-stamp-box' + (isLoser ? ' loser' : '');
        box.innerHTML = text;
        overlay.classList.add('active');

        setTimeout(() => {
            overlay.classList.remove('active');
        }, 3000);
    }

    function showGameOverModal(roomState) {
        const gameOverModal = document.getElementById('game-over-modal');
        const iconEl = document.getElementById('game-over-icon');
        const titleEl = document.getElementById('game-over-title');
        const msgEl = document.getElementById('game-over-message');
        const timerNumEl = document.getElementById('game-over-timer-num');
        const closeBtn = document.getElementById('game-over-close-btn');

        if (!gameOverModal || !roomState) return;

        const isWinnerMode = (roomState.config.game_mode !== 'LOSER');
        const targetLines = roomState.config.target_lines || roomState.config.size;

        const remaining = roomState.players.filter(p => !p.is_escaped);
        const isSolo = (roomState.players.length <= 1);
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);

        if (isSolo) {
            if (myPlayer && (myPlayer.is_escaped || (myPlayer.score || 0) >= targetLines)) {
                recordTodayResult(true, false);
                triggerStampAnimation("APPROVED<br><span style='font-size:0.8rem;'>탈출 성공!</span>", false);
                if (iconEl) iconEl.innerText = '🎉';
                if (titleEl) titleEl.innerText = '탈출 성공!';
                if (msgEl) msgEl.innerText = `축하합니다! 목표 (${targetLines}줄)를 달성하여 무사히 탈출하셨습니다!`;
                if (window.GameFX && window.GameFX.audio) window.GameFX.audio.playWin();
                fireConfetti();
            } else {
                if (iconEl) iconEl.innerText = '🏁';
                if (titleEl) titleEl.innerText = '게임 종료';
                if (msgEl) msgEl.innerText = `게임이 종료되었습니다.`;
            }
        } else {
            const loser = remaining.length > 0 ? remaining[0] : null;
            const isMeLoser = loser && (loser.player_id === myPlayerId);

            if (isMeLoser) {
                recordTodayResult(false, true);
                triggerStampAnimation("REJECTED<br><span style='font-size:0.8rem;'>최종 벌칙 당첨!</span>", true);
                if (iconEl) iconEl.innerText = '💣';
                if (titleEl) titleEl.innerText = '벌칙 당첨!';
                if (msgEl) msgEl.innerText = `아쉽게도 끝까지 탈출하지 못하여 최종 벌칙 당첨자가 되셨습니다!`;
            } else {
                const rankText = myPlayer && myPlayer.escape_rank ? `${myPlayer.escape_rank}등 ` : '';
                const isFirst = (myPlayer && myPlayer.escape_rank === 1);

                if (isFirst) {
                    recordTodayResult(true, false);
                    triggerStampAnimation(`APPROVED<br><span style='font-size:0.8rem;'>1등 탈출 우승!</span>`, false);
                    if (iconEl) iconEl.innerText = '🏆';
                    if (titleEl) titleEl.innerText = '1등 탈출 우승!';
                    if (msgEl) msgEl.innerText = `가장 먼저 탈출에 성공하여 오늘의 빙고왕에 등극하셨습니다! (벌칙 당첨자: ${loser ? loser.nickname : '없음'})`;
                } else {
                    triggerStampAnimation(`APPROVED<br><span style='font-size:0.8rem;'>${rankText}탈출 성공!</span>`, false);
                    if (iconEl) iconEl.innerText = '🎉';
                    if (titleEl) titleEl.innerText = '탈출 성공!';
                    if (msgEl) msgEl.innerText = `축하합니다! 무사히 탈출하셨습니다. (벌칙 당첨자: ${loser ? loser.nickname : '없음'})`;
                }
                if (window.GameFX && window.GameFX.audio) window.GameFX.audio.playWin();
                fireConfetti();
            }
        }

        gameOverModal.classList.add('active');
        clearInterval(gameOverTimerInterval);
        gameOverSecondsLeft = 15;
        if (timerNumEl) timerNumEl.innerText = gameOverSecondsLeft;

        gameOverTimerInterval = setInterval(() => {
            gameOverSecondsLeft--;
            if (timerNumEl) timerNumEl.innerText = gameOverSecondsLeft;
            if (gameOverSecondsLeft <= 0) {
                clearInterval(gameOverTimerInterval);
                gameOverModal.classList.remove('active');
            }
        }, 1000);

        if (closeBtn) {
            closeBtn.onclick = () => {
                clearInterval(gameOverTimerInterval);
                gameOverModal.classList.remove('active');
            };
        }
    }

    function handleServerMessage(msg) {
        switch (msg.type) {
            case 'ROOM_JOINED':
                currentRoomId = msg.room_id;
                myPlayerId = msg.player_id;
                roomState = msg.state;
                document.getElementById('lobby-section').style.display = 'none';
                document.getElementById('arena-section').style.display = 'block';
                updateArenaUI();
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
                break;
            case 'STARTING_DRAW':
                showTurnOrderDrawModal(msg.turn_order_list);
                setTimeout(() => {
                    const drawModal = document.getElementById('draw-modal');
                    if (drawModal) drawModal.classList.remove('active');
                    roomState = msg.state;
                    updateArenaUI();
                }, 2500);
                break;
            case 'ROOM_UPDATED':
                const oldStatus = roomState ? roomState.status : 'WAITING';
                roomState = msg.state;

                if (oldStatus === 'PLAYING' && roomState.status === 'WAITING') {
                    showGameOverModal(roomState);
                }

                updateArenaUI();
                if (spectatingPlayerId) renderSpectateBoard(spectatingPlayerId);
                break;
            case 'CHAT_MESSAGE':
                if (roomState && msg.chat) {
                    roomState.chat_logs.push(msg.chat);
                    renderChatLogs();
                }
                if (window.GameFX) {
                    GameFX.say(msg.chat.player_id || msg.chat.nickname, msg.chat.text);
                    GameFX.ticker(msg.chat.text, msg.chat.nickname, msg.chat.system);
                    GameFX.incrementUnread();
                }
                break;
            case 'FLOATING_REACTION':
                if (window.GameFX) {
                    if (window.GameFX.reactions) window.GameFX.reactions.spawn(msg.emoji, msg.nickname);
                    GameFX.say(msg.player_id || msg.nickname, msg.emoji);
                }
                break;
            case 'QUICK_CHAT_BUBBLE':
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
                break;
            case 'ERROR':
                showToast(msg.message || '오류가 발생했습니다.');
                break;
        }
    }

    function updateEmptyCellCount(myBoard, size) {
        const total = size * size;
        const filled = myBoard.filter(w => w && w.trim().length > 0).length;
        const emptyCount = Math.max(0, total - filled);
        const countEl = document.getElementById('empty-cell-count');
        if (countEl) countEl.innerText = `빈 칸: ${emptyCount}개`;
        return emptyCount;
    }

    function startTurnTimer(secondsLeft, totalLimit) {
        clearInterval(timerInterval);
        timerSecondsLeft = secondsLeft;
        updateTimerBar(totalLimit);

        timerInterval = setInterval(() => {
            timerSecondsLeft--;
            if (timerSecondsLeft < 0) {
                timerSecondsLeft = 0;
                clearInterval(timerInterval);
            }
            updateTimerBar(totalLimit);
        }, 1000);
    }

    function updateTimerBar(totalLimit) {
        const timerNum = document.getElementById('turn-timer-num');
        const timerFill = document.getElementById('turn-timer-fill');
        if (timerNum) timerNum.innerText = timerSecondsLeft;
        if (timerFill) {
            const pct = Math.max(0, (timerSecondsLeft / (totalLimit || 15)) * 100);
            timerFill.style.width = `${pct}%`;
        }
    }

    function updateArenaUI() {
        if (!roomState) return;
        const config = roomState.config;
        const status = roomState.status;
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);

        const displayTopicTitle = document.getElementById('display-topic-title');
        const displayGridInfo = document.getElementById('display-grid-info');
        const displayRoomCode = document.getElementById('display-room-code');
        const roomStateBadge = document.getElementById('room-state-badge');
        const displayGameMode = document.getElementById('display-game-mode');

        if (displayGameMode) {
            displayGameMode.innerText = '탈출 레이스';
            displayGameMode.className = 'mode-tag';
        }
        const footerWaitingControls = document.getElementById('footer-waiting-controls');
        const footerPlayingControls = document.getElementById('footer-playing-controls');
        const turnBanner = document.getElementById('turn-banner');
        const hostControls = document.getElementById('host-controls');
        const btnHostStart = document.getElementById('btn-host-start');
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        const myLineCount = document.getElementById('my-line-count');
        const turnPlayerBadge = document.getElementById('turn-player-badge');

        if (displayTopicTitle) displayTopicTitle.innerText = config.topic;
        if (displayGridInfo) displayGridInfo.innerText = `${config.size}x${config.size} 빙고 | 탈출 목표: ${config.target_lines || config.size}줄 (1등 우승 & 꼴찌 벌칙)`;
        if (displayRoomCode) displayRoomCode.innerText = roomState.room_id;

        if (status === 'WAITING') {
            if (roomStateBadge) { roomStateBadge.className = 'room-state-badge waiting'; roomStateBadge.innerText = '대기 중'; }
            if (footerWaitingControls) footerWaitingControls.style.display = 'flex';
            if (footerPlayingControls) footerPlayingControls.style.display = 'none';
            if (turnBanner) turnBanner.style.display = 'none';
        } else {
            if (roomStateBadge) { roomStateBadge.className = 'room-state-badge playing'; roomStateBadge.innerText = '진행 중'; }
            if (footerWaitingControls) footerWaitingControls.style.display = 'none';
            if (footerPlayingControls) footerPlayingControls.style.display = 'flex';
            if (turnBanner) turnBanner.style.display = 'flex';

            const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);
            const isMyTurn = (myPlayerId === roomState.current_turn_player_id);

            if (turnPlayerBadge) {
                turnPlayerBadge.innerText = isMyTurn ? `내 턴입니다!` : `${turnPlayer?.nickname || '참여자'}님 턴`;
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-badge my-turn';
                } else {
                    turnPlayerBadge.className = 'turn-badge other-turn';
                }
            }

            startTurnTimer(roomState.turn_time_remaining || roomState.turn_time_limit || 15, roomState.turn_time_limit || 15);

            if (isMyTurn && previousTurnPlayerId !== myPlayerId) {
                showToast("🎯 당신의 턴입니다! 빙고 단어를 선택하세요!");
            }
            previousTurnPlayerId = roomState.current_turn_player_id;
        }

        if (myPlayer) {
            const targetTotalCells = config.size * config.size;
            if (!myPlayer.board || myPlayer.board.length !== targetTotalCells) {
                const newBoard = Array(targetTotalCells).fill('');
                myPlayer.board = newBoard;
                if (status === 'WAITING') {
                    sendMessage({ type: 'UPDATE_BOARD', room_id: currentRoomId, board: newBoard });
                }
            }

            updateEmptyCellCount(myPlayer.board, config.size);
            if (myLineCount) myLineCount.innerText = `${myPlayer.score || 0} 줄`;

            if (btnToggleReady) {
                btnToggleReady.style.display = (status === 'WAITING') ? 'inline-block' : 'none';
                btnToggleReady.innerText = myPlayer.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
            }

            const isMeHost = myPlayer && (myPlayer.is_host === true || String(myPlayer.player_id) === String(roomState.players.find(p => p.is_host)?.player_id));

            if (isMeHost) {
                if (hostControls) {
                    hostControls.style.display = (status === 'WAITING') ? 'inline-flex' : 'none';
                }
                if (btnHostStart) {
                    const allReady = roomState.players.every(p => p.is_ready);
                    btnHostStart.disabled = !allReady;
                    btnHostStart.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                }
            } else {
                if (hostControls) {
                    hostControls.style.display = 'none';
                }
            }

            renderBingoBoard(myPlayer.board, myPlayer.marked, config.size, status);
            renderTopicWordChips(myPlayer.board);
        }
        renderPlayersRoster(status);
        renderChatLogs();
    }

    let previousCompletedLines = 0;

    function renderBingoBoard(board, markedIndices, size, status) {
        const bingoBoardGrid = document.getElementById('bingo-board-grid');
        if (!bingoBoardGrid) return;
        bingoBoardGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        bingoBoardGrid.setAttribute('data-size', size);
        bingoBoardGrid.innerHTML = '';
        const markedSet = new Set(markedIndices || []);

        // ⚡ 줄 완성 검사 및 레이저 슬래시 셀 감지
        const completedLineIndices = new Set();
        let currentCompletedLines = 0;

        // 1) 가로 행 검사
        for (let r = 0; r < size; r++) {
            let rowComplete = true;
            for (let c = 0; c < size; c++) {
                if (!markedSet.has(r * size + c)) { rowComplete = false; break; }
            }
            if (rowComplete) {
                currentCompletedLines++;
                for (let c = 0; c < size; c++) completedLineIndices.add(r * size + c);
            }
        }

        // 2) 세로 열 검사
        for (let c = 0; c < size; c++) {
            let colComplete = true;
            for (let r = 0; r < size; r++) {
                if (!markedSet.has(r * size + c)) { colComplete = false; break; }
            }
            if (colComplete) {
                currentCompletedLines++;
                for (let r = 0; r < size; r++) completedLineIndices.add(r * size + c);
            }
        }

        // 3) 대각선 1 검사 (\)
        let diag1Complete = true;
        for (let i = 0; i < size; i++) {
            if (!markedSet.has(i * size + i)) { diag1Complete = false; break; }
        }
        if (diag1Complete) {
            currentCompletedLines++;
            for (let i = 0; i < size; i++) completedLineIndices.add(i * size + i);
        }

        // 4) 대각선 2 검사 (/)
        let diag2Complete = true;
        for (let i = 0; i < size; i++) {
            if (!markedSet.has(i * size + (size - 1 - i))) { diag2Complete = false; break; }
        }
        if (diag2Complete) {
            currentCompletedLines++;
            for (let i = 0; i < size; i++) completedLineIndices.add(i * size + (size - 1 - i));
        }

        // 새 줄 완성 레이저 사운드 & 컷인
        if (currentCompletedLines > previousCompletedLines && status === 'PLAYING') {
            if (window.GameFX && window.GameFX.audio) {
                window.GameFX.audio.playLaser(true);
            }
            if (window.GameFX) window.GameFX.shake(6, 300);
            showToast(`⚡ 빙고 ${currentCompletedLines}줄 완성!`);
        }
        previousCompletedLines = currentCompletedLines;

        board.forEach((text, index) => {
            const cell = document.createElement('div');
            const hasText = text && text.trim().length > 0;
            const isMarked = markedSet.has(index);
            const isLineCompleted = completedLineIndices.has(index);

            cell.className = 'bingo-cell' + (isMarked ? ' marked' : '') + (isLineCompleted ? ' line-completed' : '');
            cell.innerText = hasText ? text : `(${index + 1}번)`;

            cell.onclick = () => {
                if (window.GameFX && window.GameFX.audio) {
                    window.GameFX.audio.playPop(680, 0.05);
                }
                if (status === 'WAITING') {
                    const inputVal = prompt("빙고 칸에 넣을 단어를 입력하세요:", text || "");
                    if (inputVal !== null) {
                        const newBoard = [...board];
                        newBoard[index] = inputVal.trim();
                        sendMessage({ type: 'UPDATE_BOARD', room_id: currentRoomId, board: newBoard });
                    }
                } else if (status === 'PLAYING') {
                    const isMyTurn = (myPlayerId === roomState.current_turn_player_id);
                    if (!isMyTurn) {
                        showToast("내 턴일 때만 빙고 단어를 선택할 수 있습니다!");
                        return;
                    }
                    if (isMarked) {
                        showToast("이미 선택된 단어입니다!");
                        return;
                    }
                    if (!hasText) {
                        showToast("단어가 적힌 칸을 선택해 주세요!");
                        return;
                    }

                    sendMessage({ type: 'MARK_CELL', room_id: currentRoomId, cell_index: index });
                }
            };
            bingoBoardGrid.appendChild(cell);
        });
    }

    function openSpectateModal(playerId) {
        spectatingPlayerId = playerId;
        renderSpectateBoard(playerId);
        const spectateModal = document.getElementById('spectate-modal');
        if (spectateModal) {
            spectateModal.classList.add('active');
            
            // 모달 바깥 어두운 배경 클릭 시 모달 닫기 처리 추가
            spectateModal.onclick = (e) => {
                if (e.target === spectateModal) {
                    closeSpectateModal();
                }
            };
        }
    }

    function closeSpectateModal() {
        const spectateModal = document.getElementById('spectate-modal');
        if (spectateModal) {
            spectateModal.classList.remove('active');
            spectateModal.onclick = null;
        }
        spectatingPlayerId = null;
    }

    function renderSpectateBoard(playerId) {
        const player = roomState.players.find(p => p.player_id === playerId);
        if (!player) return;

        const spectateModalTitle = document.getElementById('spectate-modal-title');
        const spectateModalScore = document.getElementById('spectate-modal-score');
        const spectateGrid = document.getElementById('spectate-grid');

        if (spectateModalTitle) spectateModalTitle.innerText = `${player.nickname}님의 실시간 관전 상태`;
        if (spectateModalScore) spectateModalScore.innerText = `현재 ${player.score}줄 완성 (목표: ${roomState.config.target_lines || roomState.config.size}줄)`;

        const size = roomState.config.size;
        if (spectateGrid) {
            spectateGrid.style.display = 'grid';
            spectateGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
            spectateGrid.style.gap = '4px';
            spectateGrid.style.width = '100%';
            spectateGrid.style.aspectRatio = '1/1';
            spectateGrid.style.margin = '10px 0';
            spectateGrid.innerHTML = '';

            const markedSet = new Set(player.marked);

            for (let idx = 0; idx < size * size; idx++) {
                const cell = document.createElement('div');
                const isMarked = markedSet.has(idx);

                cell.className = 'bingo-cell' + (isMarked ? ' marked' : '');
                cell.innerText = isMarked ? '✓' : `(${idx + 1})`;
                cell.style.cursor = 'default';
                cell.style.fontSize = '1.2rem';
                spectateGrid.appendChild(cell);
            }
        }
    }

    function renderTopicWordChips(myBoard) {
        const topicWordsChips = document.getElementById('topic-words-chips');
        if (!topicWordsChips) return;
        topicWordsChips.innerHTML = '';
        const wordPool = roomState.config.word_pool || [];
        const usedSet = new Set(myBoard.map(w => (w || '').trim()));

        wordPool.forEach(word => {
            const chip = document.createElement('div');
            const isUsed = usedSet.has((word || '').trim());
            chip.className = 'topic-word-chip' + (isUsed ? ' used' : '');
            chip.innerText = word;

            if (!isUsed && roomState.status === 'WAITING') {
                chip.onclick = () => {
                    const emptyIdx = myBoard.findIndex(w => !w || w.trim() === '');
                    if (emptyIdx !== -1) {
                        const newBoard = [...myBoard];
                        newBoard[emptyIdx] = word;
                        sendMessage({ type: 'UPDATE_BOARD', room_id: currentRoomId, board: newBoard });
                    } else {
                        showToast('더 이상 빈 칸이 없습니다!');
                    }
                };
            }
            topicWordsChips.appendChild(chip);
        });
    }

    function renderPlayersRoster(status) {
		const panelPlayers = document.getElementById('panel-players');
		const playerCountSpan = document.getElementById('player-count');
		const mobilePlayerCount = document.getElementById('mobile-player-count');
		if (!panelPlayers) return;

		panelPlayers.innerHTML = '';
		const playersList = roomState ? roomState.players : [];
		if (playerCountSpan) playerCountSpan.innerText = playersList.length;
		if (mobilePlayerCount) mobilePlayerCount.innerText = playersList.length;

		const isLoserMode = roomState?.config?.game_mode === 'LOSER';

		// 오늘의 빙고왕 전광판 렌더링
		const todayKingEl = document.getElementById('today-king-name-text');
		if (todayKingEl) {
			const todayKing = roomState ? roomState.today_king : null;
			if (todayKing && todayKing.wins > 0) {
				todayKingEl.innerText = `${todayKing.nickname} (🏆 ${todayKing.wins}승)`;
			} else {
				todayKingEl.innerText = "왕좌 비어있음";
			}
		}

		playersList.forEach((p, pIdx) => {
			let statusHtml = '';

			if (status === 'WAITING') {
				// 💡 대기실 상태
				if (p.is_ready) {
					statusHtml = '<span class="status-pill ready">준비 완료</span>';
				} else if (p.is_escaped) {
					statusHtml = `<span class="status-pill escaped">${p.escape_rank || 1}등 탈출 🏃‍♂️</span>`;
				} else {
					statusHtml = '<span class="status-pill waiting">작성 중...</span>';
				}
			} else {
				// 게임 진행 중 (PLAYING)
				if (isLoserMode && p.is_escaped) {
					statusHtml = `<span class="status-pill escaped">${p.escape_rank || 1}등 탈출 🏃‍♂️</span>`;
				} else if (isLoserMode) {
					statusHtml = `<span class="player-sub-info">${p.score || 0}줄 달성 중</span>`;
				} else {
					const isTurnP = (roomState.current_turn_player_id === p.player_id);
					statusHtml = `<span class="player-sub-info">${p.score || 0}줄 완성 ${isTurnP ? '⏳' : ''}</span>`;
				}
			}

			const winCount = p.wins || 0;
			let winBadgeHtml = '';
			if (winCount >= 3) {
				winBadgeHtml = `<span class="win-pill">👑 ${winCount}승</span>`;
			} else if (winCount > 0) {
				winBadgeHtml = `<span class="win-pill">${winCount}승</span>`;
			}

			const card = document.createElement('div');
			const isTurnPlayer = (roomState.status === 'PLAYING' && String(p.player_id) === String(roomState.current_turn_player_id));
			card.className = 'console-player-item speech-bubble-anchor' + (isTurnPlayer ? ' is-turn' : '') + (p.is_escaped && status !== 'WAITING' ? ' player-escaped' : '');
			card.setAttribute('data-player-id', p.player_id);
			const avatarColor = (window.GameFX && window.GameFX.getPlayerColor) ? window.GameFX.getPlayerColor(p, pIdx) : (p.color || '#3b82f6');
			card.innerHTML = `
				<div class="console-player-avatar ${isTurnPlayer ? 'turn-pulse' : ''}" style="background-color: ${avatarColor};">${p.nickname.charAt(0).toUpperCase()}</div>
				<div class="console-player-info">
					<div class="console-player-nick-row">
						<span class="console-player-nick">${escapeHtml(p.nickname)}</span>
						${p.is_host ? '<span class="host-pill">방장</span>' : ''}
						${winBadgeHtml}
					</div>
					<div class="console-player-sub-row">
						${statusHtml}
						<button class="console-action-pill spectate-btn" data-pid="${p.player_id}" style="padding: 1px 5px; font-size: 0.65rem;">관전</button>
					</div>
				</div>
			`;

			const specBtn = card.querySelector('.spectate-btn');
			if (specBtn) {
				specBtn.onclick = (e) => {
					e.stopPropagation();
					openSpectateModal(p.player_id);
				};
			}
			panelPlayers.appendChild(card);
		});

		// 상단 전광판 랭킹 실시간 계산
		const mvpEl = document.getElementById('rank-mvp-text');
		const loserEl = document.getElementById('rank-loser-text');

		if (mvpEl && loserEl && playersList.length > 0) {
			const sortedByWins = [...playersList].sort((a, b) => (b.wins || 0) - (a.wins || 0));
			const maxWins = sortedByWins[0]?.wins || 0;

			if (maxWins > 0) {
				const topWinners = sortedByWins.filter(p => (p.wins || 0) === maxWins);
				mvpEl.innerText = topWinners.length === 1 
					? `${topWinners[0].nickname} (${maxWins}승)` 
					: `${topWinners[0].nickname} 외 ${topWinners.length - 1}명 (${maxWins}승)`;
			} else {
				mvpEl.innerText = '집계 중...';
			}

			if (isLoserMode) {
				const losers = playersList.filter(p => p.is_loser);
				if (losers.length > 0) {
					loserEl.innerText = `${losers[0].nickname} (벌칙 당첨!)`;
				} else {
					loserEl.innerText = '진행 중...';
				}
			}
		}
	}

    function getMyNickname() {
        if (roomState && roomState.players && myPlayerId) {
            const me = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
            if (me && me.nickname) return me.nickname;
        }
        return localStorage.getItem('office_bingo_last_nickname') || '';
    }

    function renderChatLogs() {
        const chatMessagesBox = document.getElementById('chat-messages');
        if (!chatMessagesBox || !roomState) return;
        const myNick = getMyNickname();
        if (roomState.chat_logs && roomState.players && window.GameFX) {
            roomState.chat_logs.forEach(c => {
                if (!c.color && c.nickname) {
                    const pIdx = roomState.players.findIndex(pl => pl.nickname === c.nickname);
                    if (pIdx >= 0) {
                        c.color = window.GameFX.getPlayerColor(roomState.players[pIdx], pIdx);
                    }
                }
            });
        }
        if (window.GameFX && window.GameFX.renderChatStream) {
            window.GameFX.renderChatStream(chatMessagesBox, roomState.chat_logs, myNick);
        }
    }

    function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

    function initGlobalClickDelegation() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('#btn-host-reset') || e.target.closest('#btn-host-reset')) {
                const resetOptionModal = document.getElementById('reset-option-modal');
                if (resetOptionModal) resetOptionModal.classList.add('active');
                return;
            }

            if (e.target.matches('#btn-host-config') || e.target.closest('#btn-host-config')) {
                const configModal = document.getElementById('config-modal');
                if (configModal && roomState && roomState.config) {
                    const configTopicInput = document.getElementById('config-topic-input');
                    const configWordsInput = document.getElementById('config-words-input');
                    const configTargetLinesSelect = document.getElementById('config-target-lines');

                    configModalSelectedSize = roomState.config.size || 5;
                    configModalSelectedMode = roomState.config.game_mode || 'WINNER';

                    if (configTopicInput) configTopicInput.value = roomState.config.topic || '자유 주제';
                    if (configWordsInput) configWordsInput.value = (roomState.config.word_pool || []).join('\n');
                    
                    document.querySelectorAll('#config-size-options .config-size-btn').forEach(b => {
                        b.classList.toggle('selected', parseInt(b.getAttribute('data-size')) === configModalSelectedSize);
                    });

                    updateTargetLinesOptions(configModalSelectedSize, configTargetLinesSelect);
                    if (configTargetLinesSelect) configTargetLinesSelect.value = roomState.config.target_lines || configModalSelectedSize;

                    configModal.classList.add('active');
                }
                return;
            }

            const sizeBtn = e.target.closest('.size-btn');
            if (sizeBtn) {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
                sizeBtn.classList.add('selected');
                selectedSize = parseInt(sizeBtn.getAttribute('data-size')) || 5;
                const selectEl = document.getElementById('create-target-lines');
                updateTargetLinesOptions(selectedSize, selectEl);
                return;
            }

            const configSizeBtn = e.target.closest('.config-size-btn');
            if (configSizeBtn) {
                document.querySelectorAll('.config-size-btn').forEach(b => b.classList.remove('selected'));
                configSizeBtn.classList.add('selected');
                configModalSelectedSize = parseInt(configSizeBtn.getAttribute('data-size')) || 5;
                const selectEl = document.getElementById('config-target-lines');
                updateTargetLinesOptions(configModalSelectedSize, selectEl);
                return;
            }

            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                const createForm = document.getElementById('create-room-form');
                const joinForm = document.getElementById('join-room-form');
                const tabBtnCreate = document.getElementById('tab-btn-create');
                const tabBtnJoin = document.getElementById('tab-btn-join');

                if (tabBtn.id === 'tab-btn-create') {
                    if (tabBtnCreate) tabBtnCreate.classList.add('active');
                    if (tabBtnJoin) tabBtnJoin.classList.remove('active');
                    if (createForm) createForm.style.display = 'block';
                    if (joinForm) joinForm.style.display = 'none';
                } else if (tabBtn.id === 'tab-btn-join') {
                    if (tabBtnJoin) tabBtnJoin.classList.add('active');
                    if (tabBtnCreate) tabBtnCreate.classList.remove('active');
                    if (joinForm) joinForm.style.display = 'block';
                    if (createForm) createForm.style.display = 'none';
                }
            }
        });
    }

    function initGameActionControls() {
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        const btnAutoFill = document.getElementById('btn-auto-fill');
        const btnClearBoard = document.getElementById('btn-clear-board');
        const hostStartBtn = document.getElementById('btn-host-start');

        const btnResetKeep = document.getElementById('btn-reset-keep');
        const btnResetShuffle = document.getElementById('btn-reset-shuffle');
        const btnResetCancel = document.getElementById('btn-reset-cancel');
        const resetOptionModal = document.getElementById('reset-option-modal');

        const configModal = document.getElementById('config-modal');
        const configModalClose = document.getElementById('config-modal-close');
        const btnConfigSave = document.getElementById('btn-config-save');
        const btnConfigCancel = document.getElementById('btn-config-cancel');
        const spectateModalClose = document.getElementById('spectate-modal-close');

        const btnCopyLink = document.getElementById('btn-copy-link');
        const btnShowQr = document.getElementById('btn-show-qr');
        const qrModal = document.getElementById('qr-modal');
        const qrModalClose = document.getElementById('qr-modal-close');

        if (btnToggleReady) {
            btnToggleReady.onclick = () => {
                const myPlayer = roomState?.players?.find(p => p.player_id === myPlayerId);
                if (myPlayer && roomState.status === 'WAITING') {
                    const emptyCount = updateEmptyCellCount(myPlayer.board, roomState.config.size);
                    if (!myPlayer.is_ready && emptyCount > 0) {
                        showToast(`모든 칸을 채워야 준비 완료할 수 있습니다! (빈 칸: ${emptyCount}개)`);
                        return;
                    }
                }
                sendMessage({ type: 'TOGGLE_READY', room_id: currentRoomId });
            };
        }

        if (hostStartBtn) hostStartBtn.onclick = () => sendMessage({ type: 'START_GAME', room_id: currentRoomId });

        if (btnAutoFill) {
            btnAutoFill.onclick = () => {
                if (!roomState) return;
                const size = roomState.config?.size || selectedSize;
                const total = size * size;
                
                const fallbackPreset = (typeof BINGO_PRESETS !== 'undefined' && Array.isArray(BINGO_PRESETS))
                    ? (BINGO_PRESETS[1]?.words || [])
                    : [];
                let pool = roomState.config?.word_pool || [];

                if (!pool || pool.length < total) {
                    pool = [...new Set([...(pool || []), ...fallbackPreset])];
                }

                let shuffled = [...pool].sort(() => 0.5 - Math.random());
                if (shuffled.length < total) {
                    for (let i = 1; shuffled.length < total; i++) {
                        shuffled.push(`단어 ${i}`);
                    }
                }
                const newBoard = shuffled.slice(0, total);
                sendMessage({ type: 'UPDATE_BOARD', room_id: currentRoomId, board: newBoard });
                showToast("보드를 무작위로 채웠습니다.");
            };
        }

        if (btnClearBoard) {
            btnClearBoard.onclick = () => {
                if (!roomState) return;
                const size = roomState.config?.size || selectedSize;
                sendMessage({ type: 'UPDATE_BOARD', room_id: currentRoomId, board: Array(size * size).fill('') });
                showToast("보드를 비웠습니다.");
            };
        }

        if (btnResetKeep) btnResetKeep.onclick = () => { sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: true }); if (resetOptionModal) resetOptionModal.classList.remove('active'); };
        if (btnResetShuffle) btnResetShuffle.onclick = () => { sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: false }); if (resetOptionModal) resetOptionModal.classList.remove('active'); };
        if (btnResetCancel) btnResetCancel.onclick = () => { if (resetOptionModal) resetOptionModal.classList.remove('active'); };

        if (btnConfigSave) {
            btnConfigSave.onclick = () => {
                const configTopicInput = document.getElementById('config-topic-input');
                const configWordsInput = document.getElementById('config-words-input');
                const configTargetLinesSelect = document.getElementById('config-target-lines');

                const newTopic = configTopicInput ? configTopicInput.value.trim() : '자유 주제';
                const newWords = configWordsInput ? (configWordsInput.value || '').split('\n').map(w => w.trim()).filter(w => w) : [];
                const newTargetLines = configTargetLinesSelect ? parseInt(configTargetLinesSelect.value) : configModalSelectedSize;

                sendMessage({
                    type: 'UPDATE_CONFIG', room_id: currentRoomId, topic: newTopic, size: configModalSelectedSize || 5, target_lines: newTargetLines, word_pool: newWords, game_mode: configModalSelectedMode || 'WINNER', player_id: myPlayerId
                });

                const newTotalCells = (configModalSelectedSize || 5) * (configModalSelectedSize || 5);
                sendMessage({
                    type: 'UPDATE_BOARD', room_id: currentRoomId, board: Array(newTotalCells).fill('')
                });

                showToast("설정이 변경되어 보드가 즉시 업데이트되었습니다.");
                if (configModal) configModal.classList.remove('active');
            };
        }

        if (btnConfigCancel) btnConfigCancel.onclick = () => { if (configModal) configModal.classList.remove('active'); };
        if (configModalClose) configModalClose.onclick = () => { if (configModal) configModal.classList.remove('active'); };
        
        // X 버튼 클릭 이벤트
        if (spectateModalClose) {
            spectateModalClose.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeSpectateModal();
            };
        }
		
        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const fullPath = window.location.pathname;
                const basePath = fullPath.substring(0, fullPath.lastIndexOf('/'));
                const shareUrl = `${window.location.origin}${basePath}/index.html?game=bingo&room=${currentRoomId}`;
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
                const shareUrl = `${window.location.origin}${basePath}/index.html?game=bingo&room=${currentRoomId}`;
                const qrContainer = document.getElementById('qrcode');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    if (typeof QRCode === 'function') new QRCode(qrContainer, { text: shareUrl, width: 180, height: 180 });
                    else qrContainer.innerText = shareUrl;
                }
                if (qrModal) qrModal.classList.add('active');
            };
        }
        if (qrModalClose) qrModalClose.onclick = () => { if (qrModal) qrModal.classList.remove('active'); };
    }

    function saveMyNickname(nickname) {
        if (nickname) {
            localStorage.setItem('office_bingo_last_nickname', nickname);
        }
    }

    function initFormControls() {
        const createRoomForm = document.getElementById('create-room-form');
        const joinRoomForm = document.getElementById('join-room-form');

        // ★ [핵심 청소] 로컬스토리지에 저장된 기본 단어('참여자', '방장') 청소 및 자동 입력 안전 처리 ★
        const savedNick = localStorage.getItem('office_bingo_last_nickname');
        if (savedNick && savedNick !== '참여자' && savedNick !== '방장') {
            const createNickEl = document.getElementById('create-nickname');
            const joinNickEl = document.getElementById('join-nickname');
            if (createNickEl) createNickEl.value = savedNick;
            if (joinNickEl) joinNickEl.value = savedNick;
        }

        if (createRoomForm) {
            createRoomForm.onsubmit = function (e) {
                e.preventDefault();
                const nicknameEl = document.getElementById('create-nickname');
                const topicEl = document.getElementById('create-topic');
                const wordsEl = document.getElementById('create-words');
                const targetLinesEl = document.getElementById('create-target-lines');
                const titleEl = document.getElementById('create-title');

                // 사용자가 직접 입력한 텍스트 최우선 추출
                const nickname = (nicknameEl && nicknameEl.value.trim()) ? nicknameEl.value.trim() : '방장';
                saveMyNickname(nickname);

                const topic = topicEl ? (topicEl.value.trim() || '자유 주제') : '자유 주제';
                const words = wordsEl ? (wordsEl.value || '').split('\n').map(w => w.trim()).filter(w => w) : [];
                const targetLines = targetLinesEl ? parseInt(targetLinesEl.value) : selectedSize;
                const title = titleEl ? titleEl.value.trim() : '사내 실시간 빙고';

                sendMessage({
                    type: 'CREATE_ROOM',
                    game_type: 'BINGO',
                    title: title,
                    nickname: nickname,
                    size: selectedSize,
                    target_lines: targetLines,
                    topic: topic,
                    game_mode: 'LOSER',
                    word_pool: words
                });
            };
        }

        if (joinRoomForm) {
            joinRoomForm.onsubmit = function (e) {
                e.preventDefault();
                const nicknameEl = document.getElementById('join-nickname');
                // 사용자가 직접 입력한 텍스트 최우선 추출
                const nickname = (nicknameEl && nicknameEl.value.trim()) ? nicknameEl.value.trim() : '참여자';
                
                saveMyNickname(nickname);

                const roomCodeEl = document.getElementById('join-room-code');
                const roomCode = roomCodeEl ? roomCodeEl.value.trim().toUpperCase() : '';

                sendMessage({
                    type: 'JOIN_ROOM',
                    nickname: nickname,
                    room_id: roomCode
                });
            };
        }

        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        if (chatForm) {
            chatForm.onsubmit = function (e) {
                e.preventDefault();
                if (chatInput && chatInput.value.trim()) {
                    sendMessage({ type: 'CHAT_MESSAGE', room_id: currentRoomId, message: chatInput.value.trim() });
                    chatInput.value = '';
                }
            };
        }
    }

    initMobileSidebar();
    initNavControls();
    initPresetSelects();
    initGlobalClickDelegation();
    initFormControls();
    initGameActionControls();
    updateTargetLinesOptions(selectedSize, document.getElementById('create-target-lines'));
    checkUrlQueryParams();
    connectNetwork();
})();