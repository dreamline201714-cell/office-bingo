/**
 * Office Bingo Live Client Application Logic
 */

(function () {
    let socket = null;
    let peer = null;
    let p2pConnections = [];
    let p2pHostConn = null;
    let isP2P = false;
    let isStandalone = false;

    let currentRoomId = null;
    let myPlayerId = null;
    let isHost = false;
    let soundEnabled = true;
    let currentTheme = 'light';

    let roomState = null;
    let selectedSize = 5;
    let selectedGameMode = 'WINNER';
    let spectatingPlayerId = null;
    let editingCellIndex = null;

    let configModalSelectedSize = 5;

    let timerInterval = null;
    let timerSecondsLeft = 15;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSound(type) {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;

            if (type === 'click') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
                osc.start(now); osc.stop(now + 0.08);
            } else if (type === 'mark') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.06);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
                osc.start(now); osc.stop(now + 0.12);
            } else if (type === 'myTurn') {
                [659.25, 880.00].forEach((freq, idx) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + idx * 0.08);
                    g.connect(audioCtx.destination);
                    g.gain.setValueAtTime(0.3, now + idx * 0.08);
                    g.gain.linearRampToValueAtTime(0.01, now + 0.3);
                    o.start(now + idx * 0.08); o.stop(now + 0.3);
                });
            } else if (type === 'raffle') {
                for (let i = 0; i < 10; i++) {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(200 + i * 40, now + i * 0.08);
                    g.connect(audioCtx.destination);
                    g.gain.setValueAtTime(0.2, now + i * 0.08);
                    g.gain.linearRampToValueAtTime(0.01, now + (i + 1) * 0.08);
                    o.start(now + i * 0.08); o.stop(now + (i + 1) * 0.08);
                }
            } else if (type === 'ready') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
            } else if (type === 'line') {
                [523.25, 659.25, 783.99].forEach((freq, idx) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + idx * 0.05);
                    g.connect(audioCtx.destination);
                    g.gain.setValueAtTime(0.2, now + idx * 0.05);
                    g.gain.linearRampToValueAtTime(0.01, now + 0.4);
                    o.start(now + idx * 0.05); o.stop(now + 0.4);
                });
            } else if (type === 'bingo') {
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(freq, now + idx * 0.08);
                    g.connect(audioCtx.destination);
                    g.gain.setValueAtTime(0.3, now + idx * 0.08);
                    g.gain.linearRampToValueAtTime(0.01, now + 0.6);
                    o.start(now + idx * 0.08); o.stop(now + 0.6);
                });
            } else if (type === 'error') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.15);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
            }
        } catch (e) {
            console.error('Audio synth error:', e);
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        toast.innerText = message;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 2500);
    }

    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    const lobbySection = document.getElementById('lobby-section');
    const arenaSection = document.getElementById('arena-section');

    const tabBtnCreate = document.getElementById('tab-btn-create');
    const tabBtnJoin = document.getElementById('tab-btn-join');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');

    const createNicknameInput = document.getElementById('create-nickname');
    const createTopicInput = document.getElementById('create-topic');
    const createWordsInput = document.getElementById('create-words');

    const joinNicknameInput = document.getElementById('join-nickname');
    const joinRoomCodeInput = document.getElementById('join-room-code');

    const displayTopicTitle = document.getElementById('display-topic-title');
    const displayGridInfo = document.getElementById('display-grid-info');
    const displayRoomCode = document.getElementById('display-room-code');
    const displayGameMode = document.getElementById('display-game-mode');
    const roomStateBadge = document.getElementById('room-state-badge');
    const btnCopyLink = document.getElementById('btn-copy-link');
    const btnShowQr = document.getElementById('btn-show-qr');

    const turnBanner = document.getElementById('turn-banner');
    const turnPlayerBadge = document.getElementById('turn-player-badge');
    const turnTimerNum = document.getElementById('turn-timer-num');
    const turnTimerFill = document.getElementById('turn-timer-fill');
    const turnGuideText = document.getElementById('turn-guide-text');

    const hostControls = document.getElementById('host-controls');
    const btnHostStart = document.getElementById('btn-host-start');
    const btnHostReset = document.getElementById('btn-host-reset');
    const btnHostConfig = document.getElementById('btn-host-config');
    const unreadyPlayersInfo = document.getElementById('unready-players-info');

    const bingoBoardGrid = document.getElementById('bingo-board-grid');
    const footerWaitingControls = document.getElementById('footer-waiting-controls');
    const footerPlayingControls = document.getElementById('footer-playing-controls');

    const btnToggleReady = document.getElementById('btn-toggle-ready');
    const btnAutoFill = document.getElementById('btn-auto-fill');
    const btnClearBoard = document.getElementById('btn-clear-board');
    const emptyCellCountSpan = document.getElementById('empty-cell-count');
    const myLineCountBadge = document.getElementById('my-line-count');

    const topicWordsPanel = document.getElementById('topic-words-panel');
    const topicWordsChips = document.getElementById('topic-words-chips');

    const panelPlayers = document.getElementById('panel-players');
    const panelCalls = document.getElementById('panel-calls');
    const panelChat = document.getElementById('panel-chat');
    const playerCountSpan = document.getElementById('player-count');
    const chatMessagesBox = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    const stabCalls = document.getElementById('stab-calls');
    const stabChat = document.getElementById('stab-chat');

    const drawModal = document.getElementById('draw-modal');
    const drawResultList = document.getElementById('draw-result-list');

    const configModal = document.getElementById('config-modal');
    const configModalClose = document.getElementById('config-modal-close');
    const configTopicInput = document.getElementById('config-topic-input');
    const configWordsInput = document.getElementById('config-words-input');
    const btnConfigSave = document.getElementById('btn-config-save');
    const btnConfigCancel = document.getElementById('btn-config-cancel');

    const resetOptionModal = document.getElementById('reset-option-modal');
    const btnResetKeep = document.getElementById('btn-reset-keep');
    const btnResetShuffle = document.getElementById('btn-reset-shuffle');
    const btnResetCancel = document.getElementById('btn-reset-cancel');

    const editCellModal = document.getElementById('edit-cell-modal');
    const editCellModalClose = document.getElementById('edit-cell-modal-close');
    const editCellLabel = document.getElementById('edit-cell-label');
    const editCellInput = document.getElementById('edit-cell-input');
    const btnSaveCell = document.getElementById('btn-save-cell');

    const qrModal = document.getElementById('qr-modal');
    const qrModalClose = document.getElementById('qr-modal-close');
    const qrCodeContainer = document.getElementById('qrcode');

    const spectateModal = document.getElementById('spectate-modal');
    const spectateModalClose = document.getElementById('spectate-modal-close');
    const spectateModalTitle = document.getElementById('spectate-modal-title');
    const spectateModalScore = document.getElementById('spectate-modal-score');
    const spectateGrid = document.getElementById('spectate-grid');

    const mobileFab = document.getElementById('mobile-fab');
    const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
    const mobileSidebar = document.getElementById('mobile-sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            tabBtnJoin.click();
            joinRoomCodeInput.value = roomParam.toUpperCase();
        }
    }

    let messageQueue = [];

    function drainMessageQueue() {
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(msg));
            }
        }
    }

    function connectWebSocket(wsUrl) {
        statusText.innerText = '서버 연결 중...';
        statusDot.className = 'status-dot';
        try {
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                isStandalone = false;
                isP2P = false;
                statusText.innerText = '서버 연결됨';
                statusDot.className = 'status-dot connected';
                drainMessageQueue();
                checkUrlQueryParams();
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleServerMessage(data);
                } catch (e) {
                    console.error('WS Parse Error:', e);
                }
            };

            socket.onclose = () => {
                statusText.innerText = '서버 연결 중...';
                statusDot.className = 'status-dot';
                setTimeout(() => connectWebSocket(wsUrl), 2000);
            };

            socket.onerror = () => {};
        } catch (e) {
            setTimeout(() => connectWebSocket(wsUrl), 2000);
        }
    }

    function connectNetwork() {
        const isFileProtocol = (window.location.protocol === 'file:');
        const protocol = isFileProtocol ? 'ws:' : ((window.location.protocol === 'https:') ? 'wss:' : 'ws:');
        const host = isFileProtocol ? 'localhost:8765' : window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;
        connectWebSocket(wsUrl);
    }

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        } else if (socket && (socket.readyState === WebSocket.CONNECTING)) {
            messageQueue.push(msgDict);
        } else {
            handleLocalOrP2PAction(msgDict);
        }
    }

    const localSyncChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('office_bingo_channel') : null;

    if (localSyncChannel) {
        localSyncChannel.onmessage = (e) => {
            const data = e.data;
            if (!data) return;
            if (data.type === 'P2P_SYNC_REQ' && isHost && currentRoomId === data.roomCode) {
                broadcastP2PState();
            } else if (data.type === 'ROOM_UPDATED' && data.roomCode === currentRoomId) {
                if (!isHost) {
                    roomState = data.state;
                    window.roomState = roomState;
                    updateArenaUI();
                }
            } else if (data.type === 'P2P_JOIN_LOCAL' && isHost && currentRoomId === data.roomCode) {
                handleP2PHostMessage(null, {
                    type: 'P2P_JOIN_REQUEST',
                    player_id: data.player_id,
                    nickname: data.nickname
                });
            }
        };
    }

    function handleLocalOrP2PAction(data) {
        const type = data.type;

        if (type === 'CREATE_ROOM') {
            const roomCode = window.currentRoomCode || window.currentRoomId || Math.random().toString(36).substring(2, 8).toUpperCase();
            currentRoomId = roomCode;
            window.currentRoomId = roomCode;
            window.currentRoomCode = roomCode;
            myPlayerId = 'player_' + Math.random().toString(36).substring(2, 6);
            isHost = true;

            const size = data.size || selectedSize || 5;
            const topic = data.topic || '자유 주제';
            const gameMode = data.game_mode || selectedGameMode || 'WINNER';
            const wordPool = data.word_pool || [];

            const board = generateBoard(wordPool, size);
            const color = '#' + Math.floor(Math.random() * 16777215).toString(16);

            roomState = {
                room_id: roomCode,
                status: 'WAITING',
                config: { size, topic, game_mode: gameMode, word_pool: wordPool },
                called_items: [],
                current_turn_player_id: null,
                turn_time_remaining: 15,
                turn_order: [],
                current_turn_index: 0,
                players: [{
                    player_id: myPlayerId,
                    nickname: data.nickname || '방장',
                    is_host: true,
                    is_ready: false,
                    is_escaped: false,
                    escape_rank: 0,
                    is_loser: false,
                    color: color,
                    score: 0,
                    board: board,
                    marked: []
                }],
                chat_logs: []
            };

            window.roomState = roomState;
            localStorage.setItem('bingo_room_' + roomCode, JSON.stringify(roomState));

            if (localSyncChannel) {
                localSyncChannel.postMessage({ type: 'ROOM_UPDATED', roomCode: roomCode, state: roomState });
            }

            lobbySection.style.display = 'none';
            arenaSection.style.display = 'block';
            updateArenaUI();
            playSound('mark');
        }
        else if (type === 'JOIN_ROOM') {
            const roomCode = data.room_id.toUpperCase();
            currentRoomId = roomCode;
            window.currentRoomId = roomCode;
            window.currentRoomCode = roomCode;
            myPlayerId = 'player_' + Math.random().toString(36).substring(2, 6);
            isHost = false;

            const cachedStateStr = localStorage.getItem('bingo_room_' + roomCode);
            if (cachedStateStr) {
                try {
                    const parsedState = JSON.parse(cachedStateStr);
                    const size = parsedState.config.size || 5;
                    const wordPool = parsedState.config.word_pool || [];
                    const board = generateBoard(wordPool, size);
                    const color = '#' + Math.floor(Math.random() * 16777215).toString(16);

                    const existingPlayer = parsedState.players.find(p => p.nickname === data.nickname);
                    if (!existingPlayer) {
                        parsedState.players.push({
                            player_id: myPlayerId,
                            nickname: data.nickname || '참여자',
                            is_host: false,
                            is_ready: false,
                            is_escaped: false,
                            escape_rank: 0,
                            is_loser: false,
                            color: color,
                            score: 0,
                            board: board,
                            marked: []
                        });
                    }

                    roomState = parsedState;
                    window.roomState = roomState;
                    localStorage.setItem('bingo_room_' + roomCode, JSON.stringify(roomState));

                    if (localSyncChannel) {
                        localSyncChannel.postMessage({
                            type: 'P2P_JOIN_LOCAL',
                            roomCode: roomCode,
                            player_id: myPlayerId,
                            nickname: data.nickname
                        });
                        localSyncChannel.postMessage({ type: 'ROOM_UPDATED', roomCode: roomCode, state: roomState });
                    }
                } catch (e) { }
            }

            lobbySection.style.display = 'none';
            arenaSection.style.display = 'block';
            updateArenaUI();
        }
        else if (isHost) {
            processHostAction(data);
            broadcastP2PState();
        } else if (p2pHostConn) {
            p2pHostConn.send(data);
            if (localSyncChannel) {
                localSyncChannel.postMessage({ type: 'P2P_SYNC_REQ', roomCode: currentRoomId });
            }
        }
    }

    function processHostAction(data) {
        const type = data.type;
        const player = roomState.players.find(p => p.player_id === (data.player_id || myPlayerId));

        if (type === 'UPDATE_CELL_TEXT' && player) {
            player.board[data.cell_index] = data.text;
            player.is_ready = false;
        } else if (type === 'UPDATE_BOARD' && player) {
            player.board = data.board;
            player.is_ready = false;
        } else if (type === 'UPDATE_CONFIG' && isHost) {
            const newSize = parseInt(data.size) || roomState.config.size;
            const newTopic = data.topic || roomState.config.topic;
            const newWordPool = data.word_pool || roomState.config.word_pool;

            roomState.config.size = newSize;
            roomState.config.topic = newTopic;
            roomState.config.word_pool = newWordPool;

            roomState.players.forEach(p => {
                p.board = generateBoard(newWordPool, newSize);
                p.marked = [];
                p.score = 0;
                p.is_ready = false;
            });

            roomState.called_items = [];
            roomState.status = 'WAITING';

            updateArenaUI();
            broadcastP2PState();
        } else if (type === 'TOGGLE_READY' && player) {
            player.is_ready = !player.is_ready;
        } else if (type === 'START_GAME' && isHost) {
            roomState.status = 'PLAYING';
            roomState.turn_order = roomState.players.map(p => p.player_id).sort(() => 0.5 - Math.random());
            roomState.current_turn_player_id = roomState.turn_order[0];

            const turnList = roomState.turn_order.map((pid, idx) => {
                const p = roomState.players.find(pl => pl.player_id === pid);
                return { rank: idx + 1, nickname: p.nickname, color: p.color };
            });

            broadcastP2PMsg({
                type: 'STARTING_DRAW',
                turn_order_list: turnList,
                state: roomState
            });
            return;
        } else if (type === 'MARK_CELL' && player) {
            const word = player.board[data.cell_index];
            if (word && !roomState.called_items.includes(word)) {
                roomState.called_items.push(word);

                roomState.players.forEach(p => {
                    p.board.forEach((w, idx) => {
                        if (w === word && !p.marked.includes(idx)) {
                            p.marked.push(idx);
                        }
                    });
                    p.score = calcLines(p.board, p.marked, roomState.config.size);
                });

                const currIdx = roomState.turn_order.indexOf(roomState.current_turn_player_id);
                const nextIdx = (currIdx + 1) % roomState.turn_order.length;
                roomState.current_turn_player_id = roomState.turn_order[nextIdx];

                broadcastP2PMsg({
                    type: 'PLAYER_MARKED',
                    word: word,
                    caller: player.nickname,
                    state: roomState
                });
                return;
            }
        } else if (type === 'RESET_GAME' && isHost) {
            const keepBoard = data.keep_board || false;
            roomState.status = 'WAITING';
            roomState.called_items = [];

            roomState.players.forEach(p => {
                p.marked = [];
                p.score = 0;
                p.is_ready = false;
                p.is_escaped = false;
                p.is_loser = false;
                if (!keepBoard) {
                    p.board = generateBoard(roomState.config.word_pool, roomState.config.size);
                }
            });

            updateArenaUI();
            broadcastP2PState();
        } else if (type === 'CHAT_MESSAGE') {
            roomState.chat_logs.push({
                system: false,
                nickname: player ? player.nickname : '참여자',
                color: player ? player.color : '#ccc',
                text: data.message
            });
        }
    }

    function broadcastP2PState() {
        const payload = { type: 'ROOM_UPDATED', state: roomState };
        updateArenaUI();
        p2pConnections.forEach(conn => conn.send(payload));
    }

    function broadcastP2PMsg(msg) {
        handleServerMessage(msg);
        p2pConnections.forEach(conn => conn.send(msg));
    }

    function generateBoard(wordPool, size) {
        const total = size * size;
        let words = parseWordList(Array.isArray(wordPool) ? wordPool.join('\n') : (wordPool || ''));

        if (words.length < total) {
            const need = total - words.length;
            for (let i = 1; i <= need; i++) {
                words.push(`단어 ${words.length + 1}`);
            }
        }

        return words.sort(() => 0.5 - Math.random()).slice(0, total);
    }

    function calcLines(board, marked, size) {
        const m = new Set(marked);
        let lines = 0;
        for (let r = 0; r < size; r++) {
            if (Array.from({ length: size }, (_, c) => r * size + c).every(idx => m.has(idx))) lines++;
        }
        for (let c = 0; c < size; c++) {
            if (Array.from({ length: size }, (_, r) => r * size + c).every(idx => m.has(idx))) lines++;
        }
        if (Array.from({ length: size }, (_, i) => i * size + i).every(idx => m.has(idx))) lines++;
        if (Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)).every(idx => m.has(idx))) lines++;
        return lines;
    }

    function handleServerMessage(msg) {
        switch (msg.type) {
            case 'ROOM_JOINED':
                currentRoomId = msg.room_id;
                myPlayerId = msg.player_id;
                isHost = msg.is_host;
                roomState = msg.state;

                lobbySection.style.display = 'none';
                arenaSection.style.display = 'block';

                updateArenaUI();
                playSound('mark');
                break;

            case 'ROOM_UPDATED':
            case 'CONFIG_UPDATED':
                roomState = msg.state;
                updateArenaUI();
                break;

            case 'STARTING_DRAW':
                playSound('raffle');
                showTurnOrderDrawModal(msg.turn_order_list);

                setTimeout(() => {
                    drawModal.classList.remove('active');
                    roomState = msg.state;
                    updateArenaUI();
                    playSound('bingo');
                    triggerConfetti(0.4);
                }, 2500);
                break;

            case 'GAME_STARTED':
                roomState = msg.state;
                updateArenaUI();
                playSound('bingo');
                triggerConfetti(0.4);
                break;

            case 'PLAYER_MARKED':
                const prevScore = roomState ? (roomState.players.find(p => p.player_id === myPlayerId)?.score || 0) : 0;
                const prevTurnPlayer = roomState ? roomState.current_turn_player_id : null;

                roomState = msg.state;
                updateArenaUI();

                const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);
                if (myPlayer && myPlayer.score > prevScore) {
                    playSound('line');
                    triggerConfetti(0.3);
                } else {
                    playSound('mark');
                }

                if (prevTurnPlayer !== myPlayerId && roomState.current_turn_player_id === myPlayerId) {
                    playSound('myTurn');
                    showToast('🎯 내 턴이 시작되었습니다!', 'warning');
                    if (mobileSidebar && mobileSidebar.classList.contains('active')) {
                        closeMobileSidebar();
                    }
                }

                if (spectatingPlayerId) {
                    renderSpectateBoard(spectatingPlayerId);
                }
                break;

            case 'CHAT_MESSAGE':
                if (roomState && msg.chat) {
                    roomState.chat_logs.push(msg.chat);
                    renderChatLogs();
                }
                break;

            case 'GAME_ENDED':
                roomState = msg.state;
                updateArenaUI();
                setTimeout(() => {
                    showGameEndModal(msg.result);
                }, 400);
                break;

            case 'ERROR':
                showToast(msg.message || '오류가 발생했습니다.', 'error');
                playSound('error');
                break;
        }
    }

    function showTurnOrderDrawModal(turnOrderList) {
        drawResultList.innerHTML = '';
        if (turnOrderList && turnOrderList.length > 0) {
            turnOrderList.forEach(item => {
                const card = document.createElement('div');
                card.className = 'draw-card';
                card.innerHTML = `
                    <span><span style="color:${item.color};">●</span> ${escapeHtml(item.nickname)}</span>
                    <span class="draw-rank">${item.rank}번째 턴 🎯</span>
                `;
                drawResultList.appendChild(card);
            });
        }
        drawModal.classList.add('active');
    }

    function showGameEndModal(result) {
        if (!result) return;
        const modal = document.getElementById('game-end-modal');
        const emojiEl = document.getElementById('game-end-emoji');
        const titleEl = document.getElementById('game-end-title');
        const nameEl = document.getElementById('game-end-player-name');
        const badgeEl = document.getElementById('game-end-name-badge');
        const descEl = document.getElementById('game-end-desc');
        const resetBtn = document.getElementById('btn-game-end-reset');
        const closeBtn = document.getElementById('btn-game-end-close');
        if (!modal) return;

        if (result.mode === 'WINNER') {
            emojiEl.innerText = '🏆';
            titleEl.innerText = '승리자 탄생!';
            nameEl.innerText = result.winner_nickname;
            badgeEl.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
            descEl.innerText = `${result.winner_nickname}님이 모든 빙고 칸을 완성하여 1등 승리자가 되었습니다!`;
            triggerConfetti(1.0);
            playSound('bingo');
        } else {
            emojiEl.innerText = '💣';
            titleEl.innerText = '최종 패자 선정!';
            nameEl.innerText = result.loser_nickname;
            badgeEl.style.background = 'linear-gradient(135deg, #6b7280, #ef4444)';
            descEl.innerText = `${result.loser_nickname}님이 마지막까지 남아 벌칙 당첨자가 되었습니다!`;
            playSound('mark');
        }

        if (isHost) {
            resetBtn.style.display = 'inline-block';
            resetBtn.onclick = () => {
                modal.classList.remove('active');
                openResetOptionModal();
            };
        } else {
            resetBtn.style.display = 'none';
        }

        closeBtn.onclick = () => {
            modal.classList.remove('active');
        };

        modal.classList.add('active');
    }

    function openResetOptionModal() {
        if (resetOptionModal) {
            resetOptionModal.classList.add('active');
        } else {
            sendMessage({ type: 'RESET_GAME', keep_board: false });
        }
    }

    function updateArenaUI() {
        if (!roomState) return;

        const config = roomState.config;
        const status = roomState.status;
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);
        const isMyTurn = (myPlayerId === roomState.current_turn_player_id);

        displayTopicTitle.innerText = config.topic;
        displayGridInfo.innerText = `${config.size}x${config.size} 빙고 | 총 ${config.word_pool ? config.word_pool.length : 0}개 추천 단어`;
        displayRoomCode.innerText = roomState.room_id;

        const isLoserMode = (config.game_mode === 'LOSER');
        displayGameMode.innerText = isLoserMode ? '패자 결정전 (벌칙 당첨전)' : '승자 결정전 (1등 승리)';
        displayGameMode.style.background = isLoserMode ? 'var(--accent)' : 'var(--primary)';

        if (status === 'WAITING') {
            roomStateBadge.className = 'room-state-badge waiting';
            roomStateBadge.innerText = '대기 중 (작성 중)';
            footerWaitingControls.style.display = 'flex';
            footerPlayingControls.style.display = 'none';
            topicWordsPanel.style.display = 'block';
            turnBanner.style.display = 'none';

            if (myPlayer) {
                if (myPlayer.is_ready) {
                    btnToggleReady.innerText = '준비 완료됨 (해제)';
                    btnToggleReady.style.background = 'var(--success)';
                } else {
                    btnToggleReady.innerText = '준비 완료';
                    btnToggleReady.style.background = 'linear-gradient(135deg, var(--primary), var(--accent))';
                }
            }
        } else {
            roomStateBadge.className = 'room-state-badge playing';
            roomStateBadge.innerText = '게임 진행 중';
            footerWaitingControls.style.display = 'none';
            footerPlayingControls.style.display = 'flex';
            topicWordsPanel.style.display = 'none';
            turnBanner.style.display = 'flex';

            const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);
            if (turnPlayer) {
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-player-badge my-turn';
                    turnPlayerBadge.innerHTML = '내 턴입니다! (내 보드에서 단어를 클릭하세요)';
                    turnGuideText.innerText = '내 턴입니다! 선택한 단어가 방 전원의 보드에서 동시에 지워집니다.';
                } else {
                    turnPlayerBadge.className = 'turn-player-badge';
                    turnPlayerBadge.innerHTML = `<span style="color:${turnPlayer.color}; font-weight:800;">${escapeHtml(turnPlayer.nickname)}</span> 님의 턴`;
                    turnGuideText.innerText = `현재 ${turnPlayer.nickname}님의 턴입니다. 잠시 기다려주세요!`;
                }
            }

            startClientTurnTimer(roomState.turn_time_remaining || 15);
        }

        if (myPlayer && myPlayer.is_host) {
            hostControls.style.display = 'block';
            if (status === 'WAITING') {
                btnHostStart.style.display = 'inline-block';
                const nonHostPlayers = roomState.players.filter(p => !p.is_host);
                const unreadyList = nonHostPlayers.filter(p => !p.is_ready);
                const allNonHostsReady = nonHostPlayers.length > 0 && unreadyList.length === 0;

                if (unreadyPlayersInfo) {
                    if (unreadyList.length > 0) {
                        const names = unreadyList.map(p => p.nickname).join(', ');
                        unreadyPlayersInfo.innerText = `미준비 참가자: ${names}`;
                    } else {
                        unreadyPlayersInfo.innerText = nonHostPlayers.length > 0 ? '모든 참가자가 준비 완료되었습니다.' : '';
                    }
                }

                if (nonHostPlayers.length === 0) {
                    btnHostStart.disabled = true;
                    btnHostStart.style.opacity = '0.4';
                    btnHostStart.style.cursor = 'not-allowed';
                    btnHostStart.innerText = '참가자를 기다리는 중...';
                } else if (allNonHostsReady) {
                    btnHostStart.disabled = false;
                    btnHostStart.style.opacity = '1';
                    btnHostStart.style.cursor = 'pointer';
                    btnHostStart.innerText = '게임 시작하기!';
                } else {
                    btnHostStart.disabled = false;
                    btnHostStart.style.opacity = '0.7';
                    btnHostStart.style.cursor = 'pointer';
                    btnHostStart.innerText = `게임 시작 (${nonHostPlayers.length - unreadyList.length}/${nonHostPlayers.length}명 준비 완료)`;
                }
            } else {
                btnHostStart.style.display = 'none';
                if (unreadyPlayersInfo) unreadyPlayersInfo.innerText = '';
            }
        } else {
            hostControls.style.display = 'none';
        }

        if (myPlayer) {
            renderBingoBoard(myPlayer.board, myPlayer.marked, config.size, status, myPlayer.is_ready, isMyTurn);
            myLineCountBadge.innerText = `${myPlayer.score} 줄`;
            renderTopicWordChips(myPlayer.board);
            updateEmptyCellCounter(myPlayer.board);
        }

        playerCountSpan.innerText = roomState.players.length;
        renderPlayersRoster(status);
        renderCalledItems();
        renderChatLogs();
    }

    function updateEmptyCellCounter(board) {
        if (!emptyCellCountSpan) return;
        const emptyCount = board.filter(cell => !cell || !cell.trim()).length;
        if (emptyCount > 0) {
            emptyCellCountSpan.innerText = `빈 칸: ${emptyCount}개 남음`;
            emptyCellCountSpan.className = 'empty-cell-counter has-empty';
        } else {
            emptyCellCountSpan.innerText = `모든 칸 채움`;
            emptyCellCountSpan.className = 'empty-cell-counter';
        }
    }

    function startClientTurnTimer(secondsLeft) {
        clearInterval(timerInterval);
        timerSecondsLeft = secondsLeft;
        updateTimerBar();

        timerInterval = setInterval(() => {
            timerSecondsLeft--;
            if (timerSecondsLeft < 0) {
                timerSecondsLeft = 0;
                clearInterval(timerInterval);
            }
            updateTimerBar();
        }, 1000);
    }

    function updateTimerBar() {
        turnTimerNum.innerText = timerSecondsLeft;
        const pct = Math.max(0, (timerSecondsLeft / 15) * 100);
        turnTimerFill.style.width = `${pct}%`;
    }

    function triggerCellShake(cellEl) {
        if (!cellEl) return;
        cellEl.classList.remove('cell-invalid');
        void cellEl.offsetWidth;
        cellEl.classList.add('cell-invalid');
        setTimeout(() => cellEl.classList.remove('cell-invalid'), 300);
    }

    function renderBingoBoard(board, markedIndices, size, status, isReady, isMyTurn) {
        bingoBoardGrid.setAttribute('data-size', size);
        bingoBoardGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        bingoBoardGrid.innerHTML = '';
        const markedSet = new Set(markedIndices);

        if (status === 'PLAYING' && isMyTurn) {
            bingoBoardGrid.className = 'board-grid my-turn-board';
        } else {
            bingoBoardGrid.className = 'board-grid';
        }

        board.forEach((text, index) => {
            const cell = document.createElement('div');
            const hasText = text && text.trim().length > 0;
            const isMarked = markedSet.has(index);

            if (status === 'WAITING') {
                cell.className = 'bingo-cell editable' + (hasText ? '' : ' empty');
                cell.innerText = hasText ? text : `(${index + 1}번 칸)`;

                cell.addEventListener('click', () => {
                    if (isReady) {
                        showToast('준비 완료 해제 후 수정할 수 있습니다.', 'warning');
                        triggerCellShake(cell);
                        playSound('error');
                        return;
                    }
                    openEditCellModal(index, hasText ? text : '');
                });
            } else {
                cell.className = 'bingo-cell' + (isMarked ? ' marked' : '') + (isMyTurn ? '' : ' not-my-turn');
                cell.innerText = hasText ? text : `(${index + 1}번)`;

                cell.addEventListener('click', () => {
                    if (!isMyTurn) {
                        const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);
                        const turnName = turnPlayer ? turnPlayer.nickname : '다른 사람';
                        showToast(`아직 내 턴이 아닙니다! (${turnName}님의 턴)`, 'warning');
                        triggerCellShake(cell);
                        playSound('error');
                        return;
                    }

                    if (isMarked) {
                        showToast('이미 지워진 칸입니다.', 'warning');
                        triggerCellShake(cell);
                        playSound('error');
                        return;
                    }

                    if (!hasText) {
                        showToast('빈 칸은 선택할 수 없습니다.', 'warning');
                        triggerCellShake(cell);
                        playSound('error');
                        return;
                    }

                    sendMessage({
                        type: 'MARK_CELL',
                        room_id: currentRoomId,
                        cell_index: index,
                        player_id: myPlayerId
                    });
                });
            }

            bingoBoardGrid.appendChild(cell);
        });
    }

    function renderTopicWordChips(myBoard) {
        topicWordsChips.innerHTML = '';
        const wordPool = roomState.config.word_pool || [];
        const usedSet = new Set(myBoard.map(w => w.trim()));

        wordPool.forEach(word => {
            const chip = document.createElement('div');
            const isUsed = usedSet.has(word.trim());
            chip.className = 'topic-word-chip' + (isUsed ? ' used' : '');
            chip.innerText = word;

            if (!isUsed) {
                chip.addEventListener('click', () => {
                    const emptyIdx = myBoard.findIndex(w => !w || !w.trim());
                    if (emptyIdx !== -1) {
                        updateCellText(emptyIdx, word);
                        playSound('click');
                    } else {
                        showToast('모든 칸이 채워져 있습니다!', 'warning');
                        playSound('error');
                    }
                });
            }

            topicWordsChips.appendChild(chip);
        });
    }

    function openEditCellModal(index, currentText) {
        editingCellIndex = index;
        editCellLabel.innerText = `${index + 1}번 빙고 칸 내용`;
        editCellInput.value = currentText;
        editCellModal.classList.add('active');
        setTimeout(() => editCellInput.focus(), 100);
    }

    function updateCellText(cellIndex, text) {
        sendMessage({
            type: 'UPDATE_CELL_TEXT',
            room_id: currentRoomId,
            cell_index: cellIndex,
            text: text,
            player_id: myPlayerId
        });
    }

    btnSaveCell.addEventListener('click', () => {
        if (editingCellIndex !== null) {
            updateCellText(editingCellIndex, editCellInput.value.trim());
            editCellModal.classList.remove('active');
            editingCellIndex = null;
        }
    });

    editCellModalClose.addEventListener('click', () => {
        editCellModal.classList.remove('active');
        editingCellIndex = null;
    });

    function renderPlayersRoster(status) {
        if (!panelPlayers) return;
        panelPlayers.innerHTML = '';

        const myNick = createNicknameInput && createNicknameInput.value.trim() ? createNicknameInput.value.trim() : '방장';
        const playersList = (roomState && roomState.players && roomState.players.length > 0)
            ? roomState.players
            : [{ player_id: myPlayerId || 'p1', nickname: myNick, is_host: isHost, is_ready: false, color: '#6366f1' }];

        playersList.forEach(p => {
            try {
                const card = document.createElement('div');
                const isTurnPlayer = (p.player_id === (roomState ? roomState.current_turn_player_id : null) && status === 'PLAYING');
                card.className = 'player-card' + (isTurnPlayer ? ' active-turn' : '');

                const nickname = String(p.nickname || '참여자');
                const firstLetter = nickname.charAt(0).toUpperCase();
                const avatarColor = p.color || '#6366f1';

                let statusHtml = '';
                if (status === 'WAITING' || !status) {
                    statusHtml = p.is_ready
                        ? '<span class="ready-tag ready">준비 완료</span>'
                        : '<span class="ready-tag waiting">작성 중...</span>';
                } else {
                    if (p.is_loser) {
                        statusHtml = '<span class="loser-tag">패자 (벌칙)</span>';
                    } else if (p.is_escaped) {
                        statusHtml = `<span class="escaped-tag">${p.escape_rank}등 탈출</span>`;
                    } else {
                        statusHtml = `<span>${p.score || 0}줄 ${isTurnPlayer ? '🎯' : ''}</span>`;
                    }
                }

                card.innerHTML = `
                    <div class="player-info">
                        <div class="player-avatar" style="background-color: ${avatarColor};">${firstLetter}</div>
                        <div class="player-name">
                            ${escapeHtml(nickname)}
                            ${p.is_host ? '<span class="host-tag">방장</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        ${statusHtml}
                        <button class="spectate-btn" data-pid="${p.player_id || ''}">관전</button>
                    </div>
                `;

                const specBtn = card.querySelector('.spectate-btn');
                if (specBtn) {
                    specBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openSpectateModal(p.player_id);
                    });
                }

                panelPlayers.appendChild(card);
            } catch (e) {
                console.error("Error rendering player card:", e);
            }
        });
    }

    function renderCalledItems() {
        panelCalls.innerHTML = '';
        const systemLogs = (roomState && roomState.chat_logs) ? roomState.chat_logs.filter(chat => chat.system) : [];

        if (!systemLogs || systemLogs.length === 0) {
            panelCalls.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:10px;">알림 기록이 없습니다.</p>';
            return;
        }

        systemLogs.slice().reverse().forEach(chat => {
            const item = document.createElement('div');
            item.className = 'call-item-system';
            item.innerText = chat.text;
            panelCalls.appendChild(item);
        });
    }

    function renderChatLogs() {
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

    function triggerConfetti(ratio = 0.5) {
        if (typeof confetti === 'function') {
            confetti({
                particleCount: Math.floor(80 * ratio),
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }

    function initPresetChips() {
        const createGroup = document.getElementById('preset-chip-group');
        const configGroup = document.getElementById('config-preset-chip-group');

        const presets = (typeof BINGO_PRESETS !== 'undefined' && Array.isArray(BINGO_PRESETS) && BINGO_PRESETS.length > 0)
            ? BINGO_PRESETS
            : [
                { id: "custom", title: "자유 주제 (직접 입력)", words: [] },
                { id: "kospi_100", title: "코스피 시총 Top 100", words: ["삼성전자", "SK하이닉스", "LG에너지솔루션"] },
                { id: "colors_30", title: "다양한 색깔 (30가지)", words: ["빨강", "파랑", "노랑", "초록"] },
                { id: "numbers_1_50", title: "1~50 무작위 숫자", words: Array.from({ length: 50 }, (_, i) => String(i + 1)) }
            ];

        if (createGroup) {
            createGroup.innerHTML = '';
            presets.forEach((preset, index) => {
                const chip = document.createElement('div');
                chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
                chip.innerText = preset.title;

                chip.addEventListener('click', () => {
                    createGroup.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    if (preset.id === 'custom') {
                        if (createTopicInput) createTopicInput.value = '자유 주제';
                        if (createWordsInput) createWordsInput.value = '';
                    } else {
                        if (createTopicInput) createTopicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                        if (createWordsInput) createWordsInput.value = (preset.words || []).join('\n');
                    }
                    playSound('click');
                });

                createGroup.appendChild(chip);
            });
        }

        if (configGroup) {
            configGroup.innerHTML = '';
            presets.forEach((preset, index) => {
                const chip = document.createElement('div');
                chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
                chip.innerText = preset.title;

                chip.addEventListener('click', () => {
                    configGroup.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    if (preset.id === 'custom') {
                        if (configTopicInput) configTopicInput.value = '자유 주제';
                        if (configWordsInput) configWordsInput.value = '';
                    } else {
                        if (configTopicInput) configTopicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                        if (configWordsInput) configWordsInput.value = (preset.words || []).join('\n');
                    }
                    playSound('click');
                });

                configGroup.appendChild(chip);
            });
        }
    }

    function openConfigModal() {
        if (!roomState || !roomState.config) return;
        configTopicInput.value = roomState.config.topic || '자유 주제';
        configWordsInput.value = (roomState.config.word_pool || []).join('\n');
        configModalSelectedSize = roomState.config.size || 5;

        document.querySelectorAll('.config-size-btn').forEach(btn => {
            const btnSize = parseInt(btn.getAttribute('data-size'));
            if (btnSize === configModalSelectedSize) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        configModal.classList.add('active');
    }

    function closeConfigModal() {
        configModal.classList.remove('active');
    }

    function openSpectateModal(playerId) {
        spectatingPlayerId = playerId;
        renderSpectateBoard(playerId);
        spectateModal.classList.add('active');
    }

    function renderSpectateBoard(playerId) {
        const player = roomState.players.find(p => p.player_id === playerId);
        if (!player) return;

        spectateModalTitle.innerText = `${player.nickname}님의 빙고 보드`;
        spectateModalScore.innerText = roomState.status === 'WAITING'
            ? (player.is_ready ? '준비 완료 상태' : '보드 작성 중...')
            : `현재 ${player.score}줄 완성!`;

        const size = roomState.config.size;
        spectateGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        spectateGrid.innerHTML = '';

        const markedSet = new Set(player.marked);

        player.board.forEach((text, idx) => {
            const cell = document.createElement('div');
            cell.className = 'spectate-cell' + (markedSet.has(idx) ? ' marked' : '');
            cell.innerText = text || `(${idx + 1})`;
            spectateGrid.appendChild(cell);
        });
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    function parseWordList(rawText) {
        return rawText
            .split(/[\n,]/)
            .map(w => w.trim())
            .filter(w => w.length > 0);
    }

    document.addEventListener('click', (e) => {
        const configSizeBtn = e.target.closest('.config-size-btn');
        if (configSizeBtn) {
            document.querySelectorAll('.config-size-btn').forEach(b => b.classList.remove('selected'));
            configSizeBtn.classList.add('selected');
            configModalSelectedSize = parseInt(configSizeBtn.getAttribute('data-size')) || 5;
            playSound('click');
            return;
        }

        const modeBtn = e.target.closest('.mode-btn');
        if (modeBtn) {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
            modeBtn.classList.add('selected');
            selectedGameMode = modeBtn.getAttribute('data-mode') || 'WINNER';
            playSound('click');
            return;
        }

        const sizeBtn = e.target.closest('.size-btn');
        if (sizeBtn) {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            sizeBtn.classList.add('selected');
            selectedSize = parseInt(sizeBtn.getAttribute('data-size')) || 5;
            playSound('click');
            return;
        }

        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
            if (tabBtn.id === 'tab-btn-create') {
                tabBtnCreate.classList.add('active');
                tabBtnJoin.classList.remove('active');
                createRoomForm.style.display = 'block';
                joinRoomForm.style.display = 'none';
            } else if (tabBtn.id === 'tab-btn-join') {
                tabBtnJoin.classList.add('active');
                tabBtnCreate.classList.remove('active');
                joinRoomForm.style.display = 'block';
                createRoomForm.style.display = 'none';
            }
            playSound('click');
            return;
        }
    });

    createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        initAudio();

        const nickname = createNicknameInput.value.trim() || '김사원';
        const topic = createTopicInput.value.trim() || '자유 주제';
        const size = selectedSize || 5;
        const mode = selectedGameMode || 'WINNER';
        const words = parseWordList(createWordsInput.value);

        sendMessage({
            type: 'CREATE_ROOM',
            nickname: nickname,
            size: size,
            topic: topic,
            game_mode: mode,
            word_pool: words
        });
    });

    joinRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        initAudio();

        const nickname = joinNicknameInput.value.trim() || '이대리';
        const roomCode = joinRoomCodeInput.value.trim().toUpperCase();

        if (!roomCode) {
            showToast('방 코드를 입력해주세요.', 'warning');
            return;
        }

        sendMessage({
            type: 'JOIN_ROOM',
            nickname: nickname,
            room_id: roomCode
        });
    });

    btnToggleReady.addEventListener('click', () => {
        const myPlayer = roomState ? roomState.players.find(p => p.player_id === myPlayerId) : null;
        if (myPlayer) {
            const emptyCount = myPlayer.board.filter(c => !c || !c.trim()).length;
            if (emptyCount > 0 && !myPlayer.is_ready) {
                showToast(`빈 칸이 ${emptyCount}개 남아있습니다. 먼저 모두 채워주세요!`, 'error');
                playSound('error');
                return;
            }
        }

        sendMessage({
            type: 'TOGGLE_READY',
            room_id: currentRoomId,
            player_id: myPlayerId
        });
        playSound('ready');
    });

    btnAutoFill.addEventListener('click', () => {
        const pool = (roomState && roomState.config && roomState.config.word_pool) ? roomState.config.word_pool : [];
        const size = (roomState && roomState.config && roomState.config.size) ? roomState.config.size : selectedSize;
        const total = size * size;

        let words = [...pool];
        if (words.length < total) {
            for (let i = 1; i <= total - words.length; i++) {
                words.push(`단어 ${i}`);
            }
        }

        const shuffled = words.sort(() => 0.5 - Math.random()).slice(0, total);

        sendMessage({
            type: 'UPDATE_BOARD',
            room_id: currentRoomId,
            board: shuffled,
            player_id: myPlayerId
        });
        playSound('click');
        showToast('보드를 무작위로 채웠습니다.');
    });

    btnClearBoard.addEventListener('click', () => {
        const size = (roomState && roomState.config && roomState.config.size) ? roomState.config.size : selectedSize;
        const emptyBoard = Array(size * size).fill('');

        sendMessage({
            type: 'UPDATE_BOARD',
            room_id: currentRoomId,
            board: emptyBoard,
            player_id: myPlayerId
        });
        playSound('click');
        showToast('보드를 초기화했습니다.');
    });

    btnHostStart.addEventListener('click', () => {
        initAudio();
        sendMessage({
            type: 'START_GAME',
            room_id: currentRoomId,
            player_id: myPlayerId
        });
    });

    btnHostReset.addEventListener('click', () => {
        openResetOptionModal();
    });

    btnResetKeep.addEventListener('click', () => {
        sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: true });
        if (resetOptionModal) resetOptionModal.classList.remove('active');
        showToast('기존 보드를 유지한 채 대기실로 돌아왔습니다.');
    });

    btnResetShuffle.addEventListener('click', () => {
        sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: false });
        if (resetOptionModal) resetOptionModal.classList.remove('active');
        showToast('보드를 새로 섞고 대기실로 돌아왔습니다.');
    });

    btnResetCancel.addEventListener('click', () => {
        if (resetOptionModal) resetOptionModal.classList.remove('active');
    });

    btnHostConfig.addEventListener('click', () => {
        openConfigModal();
    });

    btnConfigSave.addEventListener('click', () => {
        const newTopic = configTopicInput.value.trim() || '자유 주제';
        const newWords = parseWordList(configWordsInput.value);
        const newSize = configModalSelectedSize || 5;

        sendMessage({
            type: 'UPDATE_CONFIG',
            room_id: currentRoomId,
            topic: newTopic,
            size: newSize,
            word_pool: newWords,
            player_id: myPlayerId
        });

        closeConfigModal();
        showToast('주제 및 설정이 변경되었습니다.');
    });

    btnConfigCancel.addEventListener('click', closeConfigModal);
    configModalClose.addEventListener('click', closeConfigModal);

    btnCopyLink.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('초대 링크가 복사되었습니다!');
            }).catch(() => {
                prompt('아래 링크를 복사하세요:', shareUrl);
            });
        } else {
            prompt('아래 링크를 복사하세요:', shareUrl);
        }
    });

    btnShowQr.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
        qrCodeContainer.innerHTML = '';

        if (typeof QRCode === 'function') {
            new QRCode(qrCodeContainer, {
                text: shareUrl,
                width: 200,
                height: 200
            });
        } else {
            qrCodeContainer.innerText = shareUrl;
        }

        qrModal.classList.add('active');
    });

    qrModalClose.addEventListener('click', () => qrModal.classList.remove('active'));
    spectateModalClose.addEventListener('click', () => {
        spectateModal.classList.remove('active');
        spectatingPlayerId = null;
    });

    function openMobileSidebar() {
        if (mobileSidebar) mobileSidebar.classList.add('active');
        if (mobileFab) mobileFab.style.display = 'none';
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    }

    function closeMobileSidebar() {
        if (mobileSidebar) mobileSidebar.classList.remove('active');
        if (mobileFab) mobileFab.style.display = 'block';
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    }

    if (mobileFab) mobileFab.addEventListener('click', openMobileSidebar);
    if (mobileSidebarClose) mobileSidebarClose.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    stabCalls.addEventListener('click', () => {
        stabCalls.classList.add('active');
        stabChat.classList.remove('active');
        panelCalls.style.display = 'flex';
        panelChat.style.display = 'none';
    });

    stabChat.addEventListener('click', () => {
        stabChat.classList.add('active');
        stabCalls.classList.remove('active');
        panelChat.style.display = 'flex';
        panelCalls.style.display = 'none';
        const chatBox = document.getElementById('chat-messages');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = chatInput.value.trim();
        if (msg) {
            sendMessage({
                type: 'CHAT_MESSAGE',
                room_id: currentRoomId,
                message: msg,
                player_id: myPlayerId
            });
            chatInput.value = '';
        }
    });

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggleBtn.innerText = soundEnabled ? '🔊' : '🔇';
    });

    themeToggleBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        themeToggleBtn.innerText = currentTheme === 'dark' ? '🌙' : '☀️';
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPresetChips);
    } else {
        initPresetChips();
    }

    connectNetwork();

})();