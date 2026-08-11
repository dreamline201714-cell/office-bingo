/**
 * Office Bingo Live Client Application Logic
 * Supports Local file:// Execution, Standalone Offline Mode, WebSockets & WebRTC.
 */

// Global Presets Definition (Ensures 100% visibility under any environment)
const BINGO_PRESETS = [
    {
        id: "custom",
        title: "✨ 자유 주제 (직접 입력)",
        description: "나만의 자유로운 주제와 단어를 직접 입력하여 진행합니다.",
        words: []
    },
    {
        id: "kospi_100",
        title: "📈 코스피 시총 Top 100",
        description: "대한민국 주식 시장 대표 KOSPI 시가총액 상위 100개 기업명!",
        words: [
            "삼성전자", "SK하이닉스", "LG에너지솔루션", "삼성바이오로직스", "현대차", 
            "기아", "셀트리온", "KB금융", "신한지주", "POSCO홀딩스", 
            "NAVER", "현대모비스", "삼성물산", "LG화학", "카카오", 
            "하나금융지주", "삼성SDI", "LG전자", "메리츠금융지주", "SK이노베이션", 
            "HMM", "한국전력", "KT&G", "삼성생명", "HD현대중공업", 
            "크래프톤", "한화에어로스페이스", "카카오뱅크", "삼성화재", "HD한국조선해양", 
            "삼성E&A", "SK텔레콤", "고려아연", "우리금융지주", "포스코퓨처엠", 
            "S-Oil", "KT", "기업은행", "대한항공", "포스코인터내셔널", 
            "HD현대일렉트릭", "삼성전기", "한화오션", "두산에너빌리티", "카카오페이", 
            "아모레퍼시픽", "한진칼", "하이브", "현대글로비스", "LG", 
            "한국타이어앤테크놀로지", "SK", "삼성중공업", "한화시스템", "LG디스플레이", 
            "유한양행", "금호석유", "한국항공우주", "두산밥캣", "현대제철", 
            "강원랜드", "DB손해보험", "현대해상", "LG생활건강", "CJ제일제당", 
            "에스원", "오리온", "롯데케미칼", "GS", "한미약품", 
            "한화", "현대건설", "SK바이오팜", "SKC", "포스코DX", 
            "한진", "두산", "BGF리테일", "LS", "효성티앤씨", 
            "영원무역", "GS리테일", "넷마블", "엔씨소프트", "키움증권", 
            "미래에셋증권", "한국금융지주", "NH투자증권", "삼성증권", "현대백화점", 
            "신세계", "이마트", "CJ", "롯데쇼핑", "대우건설", 
            "코웨이", "농심", "휠라홀딩스", "오뚜기", "삼양식품"
        ]
    },
    {
        id: "colors_30",
        title: "🎨 다양한 색깔 (30가지)",
        description: "원색부터 감성 컬러까지 30가지 알록달록 색상 이름!",
        words: [
            "빨강", "파랑", "노랑", "초록", "분홍", 
            "보라", "주황", "검정", "하양", "갈색", 
            "하늘", "남색", "금색", "은색", "민트", 
            "코랄", "마젠타", "시안", "올리브", "카키", 
            "청록", "베이지", "차콜", "크림슨", "라벤더", 
            "핫핑크", "네온그린", "버건디", "아이보리", "연두"
        ]
    },
    {
        id: "numbers_1_50",
        title: "🔢 1~50 무작위 숫자",
        description: "클래식 무작위 숫자 빙고!",
        words: Array.from({ length: 50 }, (_, i) => String(i + 1))
    }
];

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
    let currentTheme = 'dark';
    
    let roomState = null;
    let selectedSize = 5;
    let selectedGameMode = 'WINNER';
    let spectatingPlayerId = null;
    let editingCellIndex = null;

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
            }
        } catch (e) {
            console.error('Audio synth error:', e);
        }
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
    const presetChipGroup = document.getElementById('preset-chip-group');

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

    const bingoBoardGrid = document.getElementById('bingo-board-grid');
    const footerWaitingControls = document.getElementById('footer-waiting-controls');
    const footerPlayingControls = document.getElementById('footer-playing-controls');

    const btnToggleReady = document.getElementById('btn-toggle-ready');
    const btnAutoFill = document.getElementById('btn-auto-fill');
    const btnClearBoard = document.getElementById('btn-clear-board');
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

    const stabPlayers = document.getElementById('stab-players');
    const stabCalls = document.getElementById('stab-calls');
    const stabChat = document.getElementById('stab-chat');

    const drawModal = document.getElementById('draw-modal');
    const drawResultList = document.getElementById('draw-result-list');

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

    function connectNetwork() {
        const isFileProtocol = (window.location.protocol === 'file:');
        const hostname = window.location.hostname || 'localhost';
        const isLocal = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.'));

        if (isFileProtocol) {
            tryLocalWebSocket("ws://localhost:8001");
            return;
        }

        if (isLocal) {
            const protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${protocol}//${host}`;
            tryLocalWebSocket(wsUrl);
        } else {
            const protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${protocol}//${host}`;

            statusText.innerText = '서버 연결 중...';
            statusDot.className = 'status-dot';

            try {
                socket = new WebSocket(wsUrl);

                socket.onopen = () => {
                    statusText.innerText = '서버 연결됨';
                    statusDot.className = 'status-dot connected';
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
                    initP2PFallback();
                };

                socket.onerror = () => {
                    initP2PFallback();
                };
            } catch (e) {
                initP2PFallback();
            }
        }
    }

    function tryLocalWebSocket(wsUrl) {
        statusText.innerText = '로컬 서버 연결 중...';
        statusDot.className = 'status-dot';

        try {
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                statusText.innerText = '로컬 서버 연결됨';
                statusDot.className = 'status-dot connected';
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
                initStandaloneMode();
            };

            socket.onerror = () => {
                initStandaloneMode();
            };
        } catch (e) {
            initStandaloneMode();
        }
    }

    function initP2PFallback() {
        isP2P = true;
        statusText.innerText = 'P2P 클라우드 연결 준비됨';
        statusDot.className = 'status-dot connected';
        checkUrlQueryParams();
    }

    function initStandaloneMode() {
        isStandalone = true;
        statusText.innerText = '오프라인 단독 모드 가동됨';
        statusDot.className = 'status-dot connected';
        checkUrlQueryParams();
    }

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            tabBtnJoin.click();
            joinRoomCodeInput.value = roomParam.toUpperCase();
        }
    }

    function sendMessage(msgDict) {
        if (!isP2P && !isStandalone && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        } else {
            handleLocalOrP2PAction(msgDict);
        }
    }

    function handleLocalOrP2PAction(data) {
        const type = data.type;

        if (type === 'CREATE_ROOM') {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            currentRoomId = roomCode;
            myPlayerId = 'player_' + Math.random().toString(36).substring(2, 6);
            isHost = true;

            const size = data.size || 5;
            const topic = data.topic || '자유 주제';
            const gameMode = data.game_mode || 'WINNER';
            const wordPool = data.word_pool || [];

            const board = generateBoard(wordPool, size);
            const color = '#' + Math.floor(Math.random()*16777215).toString(16);

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

            if (isP2P && typeof Peer !== 'undefined') {
                try {
                    peer = new Peer('bingo-room-' + roomCode);
                    peer.on('connection', (conn) => {
                        p2pConnections.push(conn);
                        conn.on('data', (playerMsg) => {
                            handleP2PHostMessage(conn, playerMsg);
                        });
                    });
                } catch (e) {
                    console.error('PeerJS init fallback:', e);
                }
            }

            lobbySection.style.display = 'none';
            arenaSection.style.display = 'block';
            updateArenaUI();
            playSound('mark');
        } 
        else if (type === 'JOIN_ROOM') {
            const roomCode = data.room_id.toUpperCase();
            currentRoomId = roomCode;
            myPlayerId = 'player_' + Math.random().toString(36).substring(2, 6);
            isHost = false;

            if (isP2P && typeof Peer !== 'undefined') {
                try {
                    peer = new Peer();
                    peer.on('open', () => {
                        p2pHostConn = peer.connect('bingo-room-' + roomCode);
                        p2pHostConn.on('open', () => {
                            p2pHostConn.send({
                                type: 'P2P_JOIN_REQUEST',
                                player_id: myPlayerId,
                                nickname: data.nickname || '참여자'
                            });
                        });

                        p2pHostConn.on('data', (hostMsg) => {
                            handleServerMessage(hostMsg);
                        });
                    });
                } catch (e) {
                    console.error('PeerJS Join Exception:', e);
                }
            }
        }
        else if (isHost) {
            processHostAction(data);
            broadcastP2PState();
        } else if (p2pHostConn) {
            p2pHostConn.send(data);
        }
    }

    function handleP2PHostMessage(conn, msg) {
        if (msg.type === 'P2P_JOIN_REQUEST') {
            const size = roomState.config.size;
            const wordPool = roomState.config.word_pool;
            const board = generateBoard(wordPool, size);
            const color = '#' + Math.floor(Math.random()*16777215).toString(16);

            roomState.players.push({
                player_id: msg.player_id,
                nickname: msg.nickname,
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

            conn.send({
                type: 'ROOM_JOINED',
                room_id: currentRoomId,
                player_id: msg.player_id,
                is_host: false,
                state: roomState
            });

            broadcastP2PState();
        } else {
            processHostAction(msg);
            broadcastP2PState();
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
        let words = [...wordPool];
        if (words.length < total) {
            for (let i = 1; i <= total - words.length; i++) words.push(`단어 ${i}`);
        }
        return words.sort(() => 0.5 - Math.random()).slice(0, total);
    }

    function calcLines(board, marked, size) {
        const m = new Set(marked);
        let lines = 0;
        for (let r = 0; r < size; r++) {
            if (Array.from({length: size}, (_, c) => r * size + c).every(idx => m.has(idx))) lines++;
        }
        for (let c = 0; c < size; c++) {
            if (Array.from({length: size}, (_, r) => r * size + c).every(idx => m.has(idx))) lines++;
        }
        if (Array.from({length: size}, (_, i) => i * size + i).every(idx => m.has(idx))) lines++;
        if (Array.from({length: size}, (_, i) => i * size + (size - 1 - i)).every(idx => m.has(idx))) lines++;
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

            case 'ERROR':
                alert(msg.message || '오류가 발생했습니다.');
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

    function updateArenaUI() {
        if (!roomState) return;

        const config = roomState.config;
        const status = roomState.status;
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);
        const isMyTurn = (myPlayerId === roomState.current_turn_player_id);

        displayTopicTitle.innerText = config.topic;
        displayGridInfo.innerText = `${config.size}x${config.size} 빙고 | 총 ${config.word_pool.length}개 추천 단어`;
        displayRoomCode.innerText = roomState.room_id;

        const isLoserMode = (config.game_mode === 'LOSER');
        displayGameMode.innerText = isLoserMode ? '💣 패자 결정전 (벌칙 당첨전)' : '🏆 승자 결정전 (1등 승리)';
        displayGameMode.style.background = isLoserMode ? 'var(--accent)' : 'var(--primary)';

        if (status === 'WAITING') {
            roomStateBadge.className = 'room-state-badge waiting';
            roomStateBadge.innerText = '⏳ 대기 중 (작성 중)';
            footerWaitingControls.style.display = 'flex';
            footerPlayingControls.style.display = 'none';
            topicWordsPanel.style.display = 'block';
            turnBanner.style.display = 'none';

            if (myPlayer) {
                if (myPlayer.is_ready) {
                    btnToggleReady.innerText = '🟢 준비 완료됨 (해제)';
                    btnToggleReady.style.background = 'var(--success)';
                } else {
                    btnToggleReady.innerText = '✋ 준비 완료';
                    btnToggleReady.style.background = 'linear-gradient(135deg, var(--primary), var(--accent))';
                }
            }
        } else {
            roomStateBadge.className = 'room-state-badge playing';
            roomStateBadge.innerText = '🔥 게임 진행 중';
            footerWaitingControls.style.display = 'none';
            footerPlayingControls.style.display = 'flex';
            topicWordsPanel.style.display = 'none';
            turnBanner.style.display = 'flex';

            const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);
            if (turnPlayer) {
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-player-badge my-turn';
                    turnPlayerBadge.innerHTML = '🎯 내 턴입니다! (내 보드에서 단어를 클릭하세요)';
                    turnGuideText.innerText = '🎯 내 턴입니다! 선택한 단어가 방 전원의 보드에서 동시에 지워집니다.';
                } else {
                    turnPlayerBadge.className = 'turn-player-badge';
                    turnPlayerBadge.innerHTML = `👤 <span style="color:${turnPlayer.color}; font-weight:800;">${escapeHtml(turnPlayer.nickname)}</span> 님의 턴`;
                    turnGuideText.innerText = `현재 ${turnPlayer.nickname}님의 턴입니다. 잠시 기다려주세요!`;
                }
            }

            startClientTurnTimer(roomState.turn_time_remaining || 15);
        }

        if (myPlayer && myPlayer.is_host) {
            hostControls.style.display = 'block';

            if (status === 'WAITING') {
                btnHostStart.style.display = 'inline-block';
                const allReady = roomState.players.length > 0 && roomState.players.every(p => p.is_ready);
                btnHostStart.disabled = !allReady;
                const readyCount = roomState.players.filter(p => p.is_ready).length;
                btnHostStart.innerText = allReady 
                    ? '🎮 게임 시작하기!' 
                    : `🎮 게임 시작 (${readyCount}/${roomState.players.length}명 준비됨)`;
            } else {
                btnHostStart.style.display = 'none';
            }
        } else {
            hostControls.style.display = 'none';
        }

        if (myPlayer) {
            renderBingoBoard(myPlayer.board, myPlayer.marked, config.size, status, myPlayer.is_ready, isMyTurn);
            myLineCountBadge.innerText = `${myPlayer.score} 줄`;
            renderTopicWordChips(myPlayer.board);
        }

        playerCountSpan.innerText = roomState.players.length;
        renderPlayersRoster(status);
        renderCalledItems();
        renderChatLogs();
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

    function renderBingoBoard(board, markedIndices, size, status, isReady, isMyTurn) {
        bingoBoardGrid.setAttribute('data-size', size);
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
                        if (!confirm('준비 완료 상태에서는 수정 시 준비가 해제됩니다. 수정하시겠습니까?')) {
                            return;
                        }
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
                        alert(`아직 내 턴이 아닙니다! (현재 ${turnName}님의 턴)`);
                        return;
                    }

                    if (isMarked) {
                        alert('이미 호출되어 지워진 항목입니다.');
                        return;
                    }

                    if (!hasText) {
                        alert('빈 칸은 선택할 수 없습니다.');
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
                        alert('모든 칸이 채워져 있습니다! 수정할 칸을 먼저 클릭하세요.');
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
        panelPlayers.innerHTML = '';

        roomState.players.forEach(p => {
            const card = document.createElement('div');
            const isTurnPlayer = (p.player_id === roomState.current_turn_player_id && status === 'PLAYING');
            card.className = 'player-card' + (isTurnPlayer ? ' active-turn' : '');

            const firstLetter = p.nickname.charAt(0).toUpperCase();

            let statusHtml = '';
            if (status === 'WAITING') {
                statusHtml = p.is_ready 
                    ? '<span class="ready-tag ready">🟢 준비 완료</span>'
                    : '<span class="ready-tag waiting">🟡 작성 중...</span>';
            } else {
                if (p.is_loser) {
                    statusHtml = '<span class="loser-tag">💣 패자 (벌칙)</span>';
                } else if (p.is_escaped) {
                    statusHtml = `<span class="escaped-tag">🟢 ${p.escape_rank}등 탈출</span>`;
                } else {
                    statusHtml = `<span>${p.score}줄 ${isTurnPlayer ? '🎯' : ''}</span>`;
                }
            }

            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${p.color};">${firstLetter}</div>
                    <div class="player-name-box">
                        <div class="player-name">
                            ${escapeHtml(p.nickname)}
                            ${p.is_host ? '<span class="host-tag">방장</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="player-score">
                    ${statusHtml}
                    <button class="spectate-btn" data-pid="${p.player_id}">👁️ 관전</button>
                </div>
            `;

            card.querySelector('.spectate-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openSpectateModal(p.player_id);
            });

            panelPlayers.appendChild(card);
        });
    }

    function renderCalledItems() {
        panelCalls.innerHTML = '';
        if (!roomState.called_items || roomState.called_items.length === 0) {
            panelCalls.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">아직 불린 단어가 없습니다.</p>';
            return;
        }

        roomState.called_items.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'call-item';
            chip.innerText = item;
            panelCalls.appendChild(chip);
        });
    }

    function renderChatLogs() {
        chatMessagesBox.innerHTML = '';

        roomState.chat_logs.forEach(chat => {
            const msgEl = document.createElement('div');

            if (chat.system) {
                msgEl.className = 'chat-msg system';
                msgEl.innerText = chat.text;
            } else {
                msgEl.className = 'chat-msg';
                msgEl.innerHTML = `<span class="sender" style="color:${chat.color}">${escapeHtml(chat.nickname)}:</span> <span>${escapeHtml(chat.text)}</span>`;
            }

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
        const targetGroup = document.getElementById('preset-chip-group');
        if (!targetGroup) return;

        targetGroup.innerHTML = '';

        if (typeof BINGO_PRESETS === 'undefined' || !BINGO_PRESETS) return;

        BINGO_PRESETS.forEach((preset, index) => {
            const chip = document.createElement('div');
            chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
            chip.innerText = preset.title;

            chip.addEventListener('click', () => {
                document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                if (preset.id === 'custom') {
                    createTopicInput.value = '';
                    createWordsInput.value = '';
                } else {
                    createTopicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                    createWordsInput.value = preset.words.join('\n');
                }
                playSound('click');
            });

            targetGroup.appendChild(chip);
        });

        if (BINGO_PRESETS.length > 0 && BINGO_PRESETS[0].id === 'custom') {
            createTopicInput.value = '';
            createWordsInput.value = '';
        }
    }

    function openSpectateModal(playerId) {
        spectatingPlayerId = playerId;
        renderSpectateBoard(playerId);
        spectateModal.classList.add('active');
    }

    function renderSpectateBoard(playerId) {
        const player = roomState.players.find(p => p.player_id === playerId);
        if (!player) return;

        spectateModalTitle.innerText = `👀 ${player.nickname}님의 빙고 보드`;
        spectateModalScore.innerText = roomState.status === 'WAITING'
            ? (player.is_ready ? '🟢 준비 완료 상태' : '🟡 보드 작성 중...')
            : `현재 ${player.score}줄 완성! (총 ${player.marked_count}개 체크됨)`;

        const size = roomState.config.size;
        spectateGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        spectateGrid.innerHTML = '';

        const markedSet = new Set(player.marked);

        player.board.forEach((text, idx) => {
            const cell = document.createElement('div');
            cell.className = 'spectate-cell' + (markedSet.has(idx) ? ' marked' : '');
            cell.innerText = text || `(${idx+1})`;
            spectateGrid.appendChild(cell);
        });
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    function parseWordList(rawText) {
        return rawText
            .split(/[\n,]/)
            .map(w => w.trim())
            .filter(w => w.length > 0);
    }

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedGameMode = btn.getAttribute('data-mode');
            playSound('click');
        });
    });

    tabBtnCreate.addEventListener('click', () => {
        tabBtnCreate.classList.add('active');
        tabBtnJoin.classList.remove('active');
        createRoomForm.style.display = 'block';
        joinRoomForm.style.display = 'none';
        playSound('click');
    });

    tabBtnJoin.addEventListener('click', () => {
        tabBtnJoin.classList.add('active');
        tabBtnCreate.classList.remove('active');
        joinRoomForm.style.display = 'block';
        createRoomForm.style.display = 'none';
        playSound('click');
    });

    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedSize = parseInt(btn.getAttribute('data-size'));
            playSound('click');
        });
    });

    createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        initAudio();

        const nickname = createNicknameInput.value.trim();
        const topic = createTopicInput.value.trim() || '자유 주제';
        const words = parseWordList(createWordsInput.value);

        sendMessage({
            type: 'CREATE_ROOM',
            nickname: nickname,
            size: selectedSize,
            topic: topic,
            game_mode: selectedGameMode,
            word_pool: words
        });
    });

    joinRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        initAudio();

        const nickname = joinNicknameInput.value.trim();
        const roomCode = joinRoomCodeInput.value.trim().toUpperCase();

        sendMessage({
            type: 'JOIN_ROOM',
            nickname: nickname,
            room_id: roomCode
        });
    });

    btnToggleReady.addEventListener('click', () => {
        sendMessage({
            type: 'TOGGLE_READY',
            room_id: currentRoomId,
            player_id: myPlayerId
        });
        playSound('ready');
    });

    btnAutoFill.addEventListener('click', () => {
        const pool = roomState.config.word_pool || [];
        const size = roomState.config.size;
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
    });

    btnClearBoard.addEventListener('click', () => {
        const size = roomState.config.size;
        const emptyBoard = Array(size * size).fill('');

        sendMessage({
            type: 'UPDATE_BOARD',
            room_id: currentRoomId,
            board: emptyBoard,
            player_id: myPlayerId
        });
        playSound('click');
    });

    btnHostStart.addEventListener('click', () => {
        sendMessage({
            type: 'START_GAME',
            room_id: currentRoomId,
            player_id: myPlayerId
        });
    });

    btnHostReset.addEventListener('click', () => {
        if (confirm('대기실 상태로 돌아가며 보드를 다시 작성할 수 있게 됩니다. 진행하시겠습니까?')) {
            sendMessage({
                type: 'RESET_GAME',
                room_id: currentRoomId,
                player_id: myPlayerId
            });
        }
    });

    btnHostConfig.addEventListener('click', () => {
        const newTopic = prompt('새 주제를 입력하세요:', roomState.config.topic);
        if (newTopic !== null) {
            sendMessage({
                type: 'UPDATE_CONFIG',
                topic: newTopic.trim() || roomState.config.topic,
                size: roomState.config.size,
                word_pool: roomState.config.word_pool,
                player_id: myPlayerId
            });
        }
    });

    btnCopyLink.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert(`초대 링크가 복사되었습니다!\n${shareUrl}`);
        }).catch(err => {
            prompt('아래 링크를 복사하세요:', shareUrl);
        });
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

    stabPlayers.addEventListener('click', () => {
        stabPlayers.classList.add('active');
        stabCalls.classList.remove('active');
        stabChat.classList.remove('active');
        panelPlayers.style.display = 'flex';
        panelCalls.style.display = 'none';
        panelChat.style.display = 'none';
    });

    stabCalls.addEventListener('click', () => {
        stabCalls.classList.add('active');
        stabPlayers.classList.remove('active');
        stabChat.classList.remove('active');
        panelCalls.style.display = 'flex';
        panelPlayers.style.display = 'none';
        panelChat.style.display = 'none';
    });

    stabChat.addEventListener('click', () => {
        stabChat.classList.add('active');
        stabPlayers.classList.remove('active');
        stabCalls.classList.remove('active');
        panelChat.style.display = 'flex';
        panelPlayers.style.display = 'none';
        panelChat.style.display = 'none';
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

    // Run initPresetChips on load & DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPresetChips);
    } else {
        initPresetChips();
    }

    connectNetwork();

})();
