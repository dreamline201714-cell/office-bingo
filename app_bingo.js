/**
 * Office Bingo Live Client Application Logic - Persist Escape Rank Badge Fix
 */

(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let soundEnabled = true;
    let currentTheme = 'light';
    let previousTurnPlayerId = null;

    let roomState = null;
    let selectedSize = 5;
    let selectedGameMode = 'WINNER';
    let spectatingPlayerId = null;
    let configModalSelectedSize = 5;

    let timerInterval = null;
    let timerSecondsLeft = 15;
    let gameOverTimerInterval = null;
    let gameOverSecondsLeft = 15;

    function fireConfetti() {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
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
                    if (brandIconEl) brandIconEl.innerText = '🎯';
                    if (brandTitleEl) brandTitleEl.innerHTML = 'Office Bingo <small style="font-size:0.65rem; color:var(--accent); vertical-align:super;">LIVE</small>';
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

    function initPresetChips() {
        const createGroup = document.getElementById('preset-chip-group');
        const configGroup = document.getElementById('config-preset-chip-group');

        const presets = (typeof BINGO_PRESETS !== 'undefined' && Array.isArray(BINGO_PRESETS))
            ? BINGO_PRESETS
            : [{ id: "custom", title: "✨ 자유 주제 (직접 입력)", words: [] }];

        function buildChips(container, isConfig) {
            if (!container) return;
            container.innerHTML = '';
            presets.forEach((preset, index) => {
                const chip = document.createElement('div');
                chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
                chip.innerText = preset.title;

                chip.onclick = () => {
                    container.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    const topicInput = document.getElementById(isConfig ? 'config-topic-input' : 'create-topic');
                    const wordsInput = document.getElementById(isConfig ? 'config-words-input' : 'create-words');

                    if (preset.id === 'custom') {
                        if (topicInput) topicInput.value = '자유 주제';
                        if (wordsInput) wordsInput.value = '';
                    } else {
                        if (topicInput) topicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                        if (wordsInput) wordsInput.value = (preset.words || []).join('\n');
                    }
                };
                container.appendChild(chip);
            });
        }

        buildChips(createGroup, false);
        buildChips(configGroup, true);
    }

    function updateTargetLinesOptions(size, selectEl) {
        if (!selectEl) return;
        const maxLines = (size * 2) + 2;
        selectEl.innerHTML = '';
        for (let i = 1; i <= maxLines; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = (i === maxLines) ? `${i} 줄 완성 (올빙고 완승)` : `${i} 줄 완성 승리`;
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

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            const tabBtnJoin = document.getElementById('tab-btn-join');
            const joinRoomCodeInput = document.getElementById('join-room-code');
            if (tabBtnJoin) tabBtnJoin.click();
            if (joinRoomCodeInput) joinRoomCodeInput.value = roomParam.toUpperCase();
        }
    }

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

        if (isWinnerMode) {
            const winners = roomState.players.filter(p => (p.score || 0) >= targetLines);
            const winnerNames = winners.map(w => w.nickname).join(', ');
            const isMeWinner = winners.some(w => w.player_id === myPlayerId);

            if (isMeWinner) {
                if (iconEl) iconEl.innerText = '🏆';
                if (titleEl) titleEl.innerText = '최종 우승!';
                if (msgEl) msgEl.innerText = `축하합니다! 승리 목표를 달성하셨습니다!`;
                fireConfetti();
            } else {
                if (iconEl) iconEl.innerText = '👑';
                if (titleEl) titleEl.innerText = '게임 종료';
                if (msgEl) msgEl.innerText = `[${winnerNames}] 님이 우승하셨습니다.`;
            }
        } else {
            const remaining = roomState.players.filter(p => !p.is_escaped);
            const loser = remaining.length > 0 ? remaining[0] : null;
            const isMeLoser = loser && (loser.player_id === myPlayerId);

            if (isMeLoser) {
                if (iconEl) iconEl.innerText = '💣';
                if (titleEl) titleEl.innerText = '벌칙 당첨!';
                if (msgEl) msgEl.innerText = `아쉽게도 끝까지 탈출하지 못하여 최종 벌칙 당첨자가 되셨습니다!`;
            } else {
                if (iconEl) iconEl.innerText = '🎉';
                if (titleEl) titleEl.innerText = '탈출 성공!';
                if (msgEl) msgEl.innerText = `축하합니다! 무사히 탈출하셨습니다. (벌칙 당첨자: ${loser ? loser.nickname : '없음'})`;
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
        const footerWaitingControls = document.getElementById('footer-waiting-controls');
        const footerPlayingControls = document.getElementById('footer-playing-controls');
        const turnBanner = document.getElementById('turn-banner');
        const hostControls = document.getElementById('host-controls');
        const btnHostStart = document.getElementById('btn-host-start');
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        const myLineCount = document.getElementById('my-line-count');
        const turnPlayerBadge = document.getElementById('turn-player-badge');

        if (displayTopicTitle) displayTopicTitle.innerText = config.topic;
        if (displayGridInfo) displayGridInfo.innerText = `${config.size}x${config.size} 빙고 | 완성 목표: ${config.target_lines || config.size}줄 (${config.game_mode === 'LOSER' ? '패자 결정전' : '승자 결정전'})`;
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
    
               // 내 턴일 때와 타인 턴일 때 클래스 구분
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

            if (myPlayer.is_host) {
                if (hostControls) hostControls.style.display = status === 'WAITING' ? 'block' : 'none';
                if (btnHostStart) {
                    const allReady = roomState.players.every(p => p.is_ready);
                    btnHostStart.disabled = !allReady;
                    btnHostStart.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                }
            } else {
                if (hostControls) hostControls.style.display = 'none';
            }

            renderBingoBoard(myPlayer.board, myPlayer.marked, config.size, status);
            renderTopicWordChips(myPlayer.board);
        }
        renderPlayersRoster(status);
        renderChatLogs();
    }

    function renderBingoBoard(board, markedIndices, size, status) {
        const bingoBoardGrid = document.getElementById('bingo-board-grid');
        if (!bingoBoardGrid) return;
        bingoBoardGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        bingoBoardGrid.setAttribute('data-size', size);
        bingoBoardGrid.innerHTML = '';
        const markedSet = new Set(markedIndices || []);

        board.forEach((text, index) => {
            const cell = document.createElement('div');
            const hasText = text && text.trim().length > 0;
            const isMarked = markedSet.has(index);

            cell.className = 'bingo-cell' + (isMarked ? ' marked' : '');
            cell.innerText = hasText ? text : `(${index + 1}번)`;

            cell.onclick = () => {
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
        if (spectateModal) spectateModal.classList.add('active');
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

    // ★ [핵심 정밀 수정] 대기실(WAITING) 상태라도 지난 게임 탈출 순위 뱃지 우선 노출 ★
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

        playersList.forEach(p => {
            let statusHtml = '';

            // 탈출 정보가 남아있으면 WAITING 여부와 무관하게 탈출 순위 우선 렌더링
            if (isLoserMode && p.is_escaped) {
                statusHtml = `<span class="escape-rank-badge escaped">${p.escape_rank || 1}등 탈출 🏃‍♂️</span>`;
            } else if (status === 'WAITING') {
                statusHtml = p.is_ready 
                    ? '<span class="ready-tag ready">준비 완료</span>' 
                    : '<span class="ready-tag waiting">작성 중...</span>';
            } else {
                if (isLoserMode) {
                    statusHtml = `<span class="escape-rank-badge playing">${p.score || 0}줄 달성 중</span>`;
                } else {
                    statusHtml = `<span style="font-size:0.75rem; font-weight:bold; color:var(--accent);">${p.score || 0}줄 완성</span>`;
                }
            }

            const winCount = p.wins || 0;
            const winBadgeHtml = winCount > 0 ? `<span class="win-count-badge">👑 ${winCount}승</span>` : '';

            const card = document.createElement('div');
            card.className = 'player-card' + (p.is_escaped ? ' player-escaped' : '');
            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${p.color};">${p.nickname.charAt(0)}</div>
                    <div class="player-name">${escapeHtml(p.nickname)} ${p.is_host ? '<span class="host-tag">방장</span>' : ''} ${winBadgeHtml}</div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    ${statusHtml}
                    <button class="spectate-btn" data-pid="${p.player_id}">관전</button>
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
    }

    function renderChatLogs() {
        const chatMessagesBox = document.getElementById('chat-messages');
        if (!chatMessagesBox) return;
        chatMessagesBox.innerHTML = '';
        if (!roomState || !roomState.chat_logs) return;
        roomState.chat_logs.forEach(chat => {
            if (chat.system) return;
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.innerHTML = `<span class="sender" style="color:${chat.color}">${escapeHtml(chat.nickname)}:</span> <span>${escapeHtml(chat.text)}</span>`;
            chatMessagesBox.appendChild(msgEl);
        });
        chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
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

            const modeBtn = e.target.closest('.mode-btn');
            if (modeBtn) {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
                modeBtn.classList.add('selected');
                selectedGameMode = modeBtn.getAttribute('data-mode') || 'WINNER';
                const displayGameMode = document.getElementById('display-game-mode');
                if (displayGameMode) {
                    displayGameMode.innerText = selectedGameMode === 'WINNER' ? '승자 결정전' : '패자 결정전';
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
                    type: 'UPDATE_CONFIG', room_id: currentRoomId, topic: newTopic, size: configModalSelectedSize || 5, target_lines: newTargetLines, word_pool: newWords, player_id: myPlayerId
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
        if (spectateModalClose) spectateModalClose.onclick = () => { if (spectateModal) spectateModal.classList.remove('active'); spectatingPlayerId = null; };

        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
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
                const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
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

    function initFormControls() {
        const createRoomForm = document.getElementById('create-room-form');
        const joinRoomForm = document.getElementById('join-room-form');

        if (createRoomForm) {
            createRoomForm.onsubmit = function (e) {
                e.preventDefault();
                const nicknameEl = document.getElementById('create-nickname');
                const topicEl = document.getElementById('create-topic');
                const wordsEl = document.getElementById('create-words');
                const targetLinesEl = document.getElementById('create-target-lines');
                const titleEl = document.getElementById('create-title');

                const nickname = nicknameEl ? (nicknameEl.value.trim() || '김사원') : '김사원';
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
                    game_mode: selectedGameMode,
                    word_pool: words
                });
            };
        }

        if (joinRoomForm) {
            joinRoomForm.onsubmit = function (e) {
                e.preventDefault();
                const nicknameEl = document.getElementById('join-nickname');
                const roomCodeEl = document.getElementById('join-room-code');

                const nickname = nicknameEl ? (nicknameEl.value.trim() || '이대리') : '이대리';
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

    initStealthMode();
    initMobileSidebar();
    initNavControls();
    initPresetChips();
    initGlobalClickDelegation();
    initFormControls();
    initGameActionControls();
    updateTargetLinesOptions(selectedSize, document.getElementById('create-target-lines'));
    connectNetwork();
})();