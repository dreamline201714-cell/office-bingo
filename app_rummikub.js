/**
 * Office Rummikub Live Client Application Logic - Permanent Sidebar & Snapshot Locking
 */
(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let roomState = null;
    let previousTurnPlayerId = null;
    let lastTurnNumber = -1;

    let initialTurnRack = [];
    let initialTurnTableSets = [];

    let newlyPlacedTileIds = new Set();
    let highlightExpireTimeout = null;

    let selectedTiles = []; 
    let localRack = [];
    let localTableSets = [];
	// ★ 2차원 배열 형태의 다중 슬롯 임시 보관함 (기본 1개 슬롯 제공)
    let localScratchSlots = [[]]; 
    let isScratchpadOpen = false;
	
    let currentSortMode = 'none'; 
    let selectedTimeLimit = 60; 
	// ★ 테이블 스케일 및 자동 줌 제어 변수 추가
    let tableZoomScale = 1.0;
    let isAutoZoomMode = true;

    let timerInterval = null;
    let timerSecondsLeft = 60;
    let soundEnabled = true;

    let audioCtx = null;
    function playSoundEffect(type) {
        if (!soundEnabled) return;
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'place') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
            } else if (type === 'turn') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.08);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
            }
        } catch (err) {
            console.error(err);
        }
    }

    function saveMyNickname(nickname) {
        if (nickname) {
            localStorage.setItem('office_rummikub_last_nickname', nickname);
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
            if (statusEl) statusEl.innerText = '연결됨'; 
            
            const savedNick = localStorage.getItem('office_rummikub_last_nickname');
            if (currentRoomId && savedNick) {
                sendMessage({
                    type: 'JOIN_ROOM',
                    nickname: savedNick,
                    room_id: currentRoomId
                });
            } else {
                checkUrlQueryParams();
            }
        };

        socket.onmessage = (e) => {
            try { handleServerMessage(JSON.parse(e.data)); } catch (err) { console.error(err); }
        };

        socket.onclose = () => {
            const statusEl = document.getElementById('status-text');
            if (statusEl) statusEl.innerText = '연결 끊김';
            setTimeout(connectNetwork, 2000);
        };
    }

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        } else {
            showToast("서버와 연결 중입니다. 잠시 후 다시 시도해주세요.");
        }
    }

    function handleServerMessage(msg) {
        if (msg.type === 'ROOM_JOINED') {
            currentRoomId = msg.room_id;
            myPlayerId = msg.player_id;
            roomState = msg.state;
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('arena-section').style.display = 'block';
            updateUI(true);
        } else if (msg.type === 'STARTING_DRAW') {
            showTurnOrderDrawModal(msg.turn_order_list);
            setTimeout(() => {
                const drawModal = document.getElementById('draw-modal');
                if (drawModal) drawModal.classList.remove('active');
                roomState = msg.state;
                updateUI(true);
            }, 2500);
        } else if (msg.type === 'GAME_OVER') {
            showWinnerModal(msg.winner_name);
        } else if (msg.type === 'ROOM_UPDATED') {
            if (roomState && roomState.table_sets && msg.state && msg.state.table_sets) {
                const oldIds = new Set(roomState.table_sets.flat().map(t => t.id));
                const newIds = msg.state.table_sets.flat().map(t => t.id).filter(id => !oldIds.has(id));
                
                if (newIds.length > 0) {
                    newlyPlacedTileIds = new Set(newIds);
                    clearTimeout(highlightExpireTimeout);
                    highlightExpireTimeout = setTimeout(() => {
                        newlyPlacedTileIds.clear();
                        renderTable();
                    }, 4000);
                }
            }

            roomState = msg.state;
            updateUI(false);
        } else if (msg.type === 'CHAT_MESSAGE') {
            if (roomState && msg.chat) {
                roomState.chat_logs.push(msg.chat);
                renderChatLogs();
            }
        } else if (msg.type === 'ERROR') {
            showToast(msg.message || '오류가 발생했습니다.');
            const hostStartBtn = document.getElementById('btn-host-start');
            if (hostStartBtn) hostStartBtn.disabled = false;
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

    function sortTileSetAuto(set) {
        if (!set || set.length <= 1) return set;
        const jokers = set.filter(t => t.is_joker);
        const nonJokers = set.filter(t => !t.is_joker);

        if (nonJokers.length === 0) return set;

        const isSameNumber = nonJokers.every(t => t.number === nonJokers[0].number);
        if (isSameNumber) {
            nonJokers.sort((a, b) => a.color.localeCompare(b.color));
            return [...nonJokers, ...jokers];
        }

        const isSameColor = nonJokers.every(t => t.color === nonJokers[0].color);
        if (isSameColor) {
            nonJokers.sort((a, b) => a.number - b.number);
            let availableJokers = [...jokers];
            let result = [];

            for (let i = 0; i < nonJokers.length; i++) {
                result.push(nonJokers[i]);
                if (i < nonJokers.length - 1) {
                    const diff = nonJokers[i + 1].number - nonJokers[i].number;
                    if (diff > 1) {
                        const needed = diff - 1;
                        for (let k = 0; k < needed && availableJokers.length > 0; k++) {
                            result.push(availableJokers.shift());
                        }
                    }
                }
            }

            while (availableJokers.length > 0) {
                const j = availableJokers.shift();
                const lastNum = nonJokers[nonJokers.length - 1].number;
                if (lastNum >= 13) {
                    result.unshift(j);
                } else {
                    result.push(j);
                }
            }

            return result;
        }

        return set;
    }

    function isValidRummikubSet(set) {
        if (!set || set.length < 3) return false;
        const nonJokers = set.filter(t => !t.is_joker);
        if (nonJokers.length === 0) return true;

        const isGroup = nonJokers.every(t => t.number === nonJokers[0].number);
        if (isGroup) {
            const colors = nonJokers.map(t => t.color);
            return (new Set(colors)).size === colors.length && set.length <= 4;
        }

        const isSameColor = nonJokers.every(t => t.color === nonJokers[0].color);
        if (isSameColor) {
            const sorted = [...nonJokers].sort((a, b) => a.number - b.number);
            let neededJokers = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                const diff = sorted[i+1].number - sorted[i].number;
                if (diff === 0) return false;
                if (diff > 1) neededJokers += (diff - 1);
            }
            return (set.length - nonJokers.length) >= neededJokers;
        }

        return false;
    }

    function calculateSetScore(set) {
        if (!set || set.length === 0) return 0;
        const nonJokers = set.filter(t => !t.is_joker);
        const jokerCount = set.length - nonJokers.length;
        if (nonJokers.length === 0) return 0;

        // 그룹 (같은 숫자, 다른 색상): 조커도 해당 숫자의 값을 가짐
        const isGroup = nonJokers.every(t => t.number === nonJokers[0].number);
        if (isGroup) {
            return nonJokers[0].number * set.length;
        }

        // 연속 (같은 색상, 연속된 숫자)
        const isSameColor = nonJokers.every(t => t.color === nonJokers[0].color);
        if (isSameColor) {
            const sorted = [...nonJokers].sort((a, b) => a.number - b.number);
            const minNum = sorted[0].number;
            const maxNum = sorted[sorted.length - 1].number;

            // nonJokers 내부의 빈 간격(gap) 수 계산
            let internalGaps = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                internalGaps += (sorted[i + 1].number - sorted[i].number - 1);
            }

            // 남은 조커 개수
            let remainingJokers = jokerCount - internalGaps;

            // 시작 번호(startNum) 결정: 앞쪽으로 1 미만이 되지 않는 한도 내에서 최대한 확장
            let startNum = minNum;
            // 끝 번호(endNum) 기본값
            let endNum = maxNum;

            // 남는 조커는 뒤(13 이하) 또는 앞(1 이상)에 배치
            while (remainingJokers > 0) {
                if (endNum < 13) {
                    endNum++;
                } else if (startNum > 1) {
                    startNum--;
                }
                remainingJokers--;
            }

            // startNum부터 set.length 개의 연속된 숫자 합산
            let totalScore = 0;
            for (let i = 0; i < set.length; i++) {
                totalScore += (startNum + i);
            }
            return totalScore;
        }
        return 0;
    }

    function applyRackSort() {
        if (currentSortMode === 'color') {
            localRack.sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);
        } else if (currentSortMode === 'number') {
            localRack.sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
        }
    }
	function setTableZoom(scale, isAuto = false) {
        // ★ 최소 배율을 0.72(72%)로 방어하여 타일 식별 및 여유 폭 보장
        tableZoomScale = Math.min(1.05, Math.max(0.72, Math.round(scale * 100) / 100));
        const container = document.getElementById('table-sets-container');
        const zoomText = document.getElementById('zoom-level-text');

        if (container) {
            container.style.setProperty('--rummi-scale', tableZoomScale);
        }
        if (zoomText) {
            zoomText.innerText = `${Math.round(tableZoomScale * 100)}%${isAuto ? '(A)' : ''}`;
        }
    }

    function evaluateAutoZoom() {
        if (!isAutoZoomMode) return;
        const setCount = localTableSets.length;
        
        // ★ 5~6타일 버퍼가 유지되므로 실제 보드 세트 개수에 맞춰 현실적으로 축소
        if (setCount <= 4) {
            setTableZoom(1.0, true);
        } else if (setCount <= 8) {
            setTableZoom(0.90, true);
        } else if (setCount <= 12) {
            setTableZoom(0.82, true);
        } else {
            setTableZoom(0.74, true);
        }
    }

    function updateUI(isFirstJoin) {
        if (!roomState) return;

        const status = roomState.status;
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'GAME_STATUS_CHANGE', status: status }, '*');
        }

        const myPlayer = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
        const readyBtn = document.getElementById('btn-toggle-ready');
        const turnBanner = document.getElementById('turn-banner');
        const turnPlayerBadge = document.getElementById('turn-player-badge');
        const hostControls = document.getElementById('host-controls');
        const hostStartBtn = document.getElementById('btn-host-start');
        const roomBadge = document.getElementById('room-state-badge');

        const roomCodeEl = document.getElementById('display-room-code');
        if (roomCodeEl) roomCodeEl.innerText = roomState.room_id;
        
        const gridInfoEl = document.getElementById('display-grid-info');
        if (gridInfoEl) {
            const poolCount = roomState.tile_pool_count !== undefined ? roomState.tile_pool_count : '-';
            const ruleText = roomState.rule_type === 'jaehee' ? '재히룰(단일 30점)' : '공식룰(합산 30점)';
            gridInfoEl.innerText = `룰: ${ruleText} | 턴 제한: ${roomState.turn_time_limit || 60}초 | 남은 타일: ${poolCount}개`;
        }

        if (status === 'WAITING') {
            if (roomBadge) { roomBadge.className = 'room-state-badge waiting'; roomBadge.innerText = '대기 중'; }
            if (turnBanner) turnBanner.style.display = 'none';
            if (readyBtn) {
                readyBtn.style.display = 'inline-block';
                readyBtn.innerText = myPlayer?.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
            }

            if (myPlayer && myPlayer.is_host) {
                if (hostControls) hostControls.style.display = 'flex';
                if (hostStartBtn) {
                    const allReady = roomState.players.every(p => p.is_ready);
                    hostStartBtn.disabled = !allReady;
                    hostStartBtn.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                }
            } else {
                if (hostControls) hostControls.style.display = 'none';
            }
        } else {
            if (roomBadge) { roomBadge.className = 'room-state-badge playing'; roomBadge.innerText = '게임 진행 중'; }
            if (turnBanner) turnBanner.style.display = 'flex';
            if (hostControls) hostControls.style.display = 'none';
            if (readyBtn) readyBtn.style.display = 'none';

            const isMyTurn = (String(myPlayerId) === String(roomState.current_turn_player_id));
            const turnPlayer = roomState.players.find(p => String(p.player_id) === String(roomState.current_turn_player_id));

            if (turnPlayerBadge) {
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-player-badge my-turn';
                    turnPlayerBadge.innerText = '내 턴입니다! (타일을 자유롭게 이동/재조합하세요)';
                } else {
                    turnPlayerBadge.className = 'turn-player-badge';
                    turnPlayerBadge.innerHTML = `<span style="color:${turnPlayer?.color || 'var(--text-primary)'};">${escapeHtml(turnPlayer?.nickname || '참여자')}</span> 님의 턴`;
                }
            }

            const turnNumber = roomState.turn_count !== undefined ? roomState.turn_count : (roomState.round !== undefined ? roomState.round : 0);
            const isNewTurn = (isMyTurn && String(previousTurnPlayerId) !== String(myPlayerId)) ||
                              (isMyTurn && lastTurnNumber !== -1 && turnNumber !== lastTurnNumber);

            if (isNewTurn || (isMyTurn && (!initialTurnTableSets || initialTurnTableSets.length === 0))) {
                playSoundEffect('turn');
                showToast("🧩 당신의 턴입니다! 배치를 시작하세요.");
                selectedTiles = [];
                initialTurnRack = JSON.parse(JSON.stringify(myPlayer?.rack || []));
                initialTurnTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
                lastTurnNumber = turnNumber;
            }
            previousTurnPlayerId = roomState.current_turn_player_id;
            startClientTurnTimer(roomState.turn_time_remaining || 60, roomState.turn_time_limit || 60);
        }

        if (myPlayer && myPlayer.rack) {
            // 임시작업대에 이미 올라가 있는 타일 ID 추출
            const scratchTileIds = new Set(localScratchSlots.flat().map(t => t.id));
            
            // 서버의 최신 랙 타일 중 임시작업대에 빠져나간 타일을 제외하여 복제 방지
            localRack = myPlayer.rack.filter(t => !scratchTileIds.has(t.id));
            applyRackSort();
        }

        localTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
        localTableSets = localTableSets.map(set => sortTileSetAuto(set));

        renderRack();
        renderScratchpad();
        renderTable();
        renderPlayers();
        renderChatLogs();
    }

    function startClientTurnTimer(secondsLeft, totalLimit) {
        clearInterval(timerInterval);
        timerSecondsLeft = secondsLeft;
        updateTimerBar(totalLimit);

        timerInterval = setInterval(() => {
            timerSecondsLeft--;
            if (timerSecondsLeft <= 0) {
                timerSecondsLeft = 0;
                clearInterval(timerInterval);

                const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id));
                if (isMyTurn) {
                    const originalTableCount = (initialTurnTableSets || []).flat().length;
                    const currentTableCount = localTableSets.flat().length;
                    const isTilePlaced = currentTableCount > originalTableCount;
                    const invalidSet = localTableSets.find(s => !isValidRummikubSet(s));

                    const myPlayer = roomState?.players?.find(p => String(p.player_id) === String(myPlayerId));
                    let isMeldValid = true;

                    if (myPlayer && !myPlayer.has_opened && isTilePlaced) {
                        const ruleType = roomState.rule_type || 'official';
                        const initialTileIds = new Set((initialTurnTableSets || []).flat().map(t => t.id));
                        const newlyPlacedSets = localTableSets.filter(set => 
                            isValidRummikubSet(set) && set.some(t => !initialTileIds.has(t.id))
                        );

                        if (ruleType === 'jaehee') {
                            isMeldValid = newlyPlacedSets.some(set => calculateSetScore(set) >= 30);
                        } else {
                            let newPlacedScore = 0;
                            newlyPlacedSets.forEach(set => { newPlacedScore += calculateSetScore(set); });
                            isMeldValid = (newPlacedScore >= 30);
                        }
                    }

                    if (isTilePlaced && !invalidSet && isMeldValid) {
                        showToast("⏱️ 시간 초과로 자동 제출되었습니다.");
                        sendMessage({ type: 'SUBMIT_TURN', room_id: currentRoomId, table_sets: localTableSets, rack: localRack });
                    } else {
                        showToast("⏱️ 제한 시간 초과! (타일 1장을 가져옵니다)");
                        selectedTiles = [];
                        sendMessage({ type: 'TIMEOUT_PASS', room_id: currentRoomId });
                    }
                }
            }
            updateTimerBar(totalLimit);
        }, 1000);
    }

    function updateTimerBar(totalLimit) {
        const timerNum = document.getElementById('turn-timer-num');
        const timerFill = document.getElementById('turn-timer-fill');
        if (timerNum) timerNum.innerText = timerSecondsLeft;
        if (timerFill) {
            const pct = Math.max(0, (timerSecondsLeft / (totalLimit || 60)) * 100);
            timerFill.style.width = `${pct}%`;
        }
    }

    function createTileElement(tile, isSelected) {
        const div = document.createElement('div');
        div.className = `rummi-tile-wrapper ${isSelected ? 'selected' : ''}`;
        div.setAttribute('data-tile-id', tile.id);

        const colorMap = {
            'black': '#1e293b',
            'blue': '#0284c7',
            'orange': '#f59e0b',
            'red': '#dc2626',
            'joker': '#dc2626'
        };
        const fontColor = colorMap[tile.color] || '#1e293b';

        let innerSymbolSvg = '';
        if (tile.is_joker) {
            innerSymbolSvg = `
                <circle cx="50" cy="62" r="22" fill="none" stroke="${fontColor}" stroke-width="4.5"/>
                <circle cx="42" cy="56" r="3.2" fill="${fontColor}"/>
                <circle cx="58" cy="56" r="3.2" fill="${fontColor}"/>
                <path d="M 40 68 Q 50 78 60 68" fill="none" stroke="${fontColor}" stroke-width="4" stroke-linecap="round"/>
            `;
        } else {
            innerSymbolSvg = `
                <text x="50" y="66" 
                      font-family="'Impact', 'Arial Black', -apple-system, sans-serif" 
                      font-size="54" 
                      font-weight="900" 
                      fill="${fontColor}" 
                      text-anchor="middle" 
                      dominant-baseline="central" 
                      letter-spacing="-2.5"
                      filter="url(#engrave_${tile.id})">
                    ${tile.number}
                </text>
            `;
        }

        div.innerHTML = `
            <svg viewBox="0 0 100 148" class="rummi-vector-tile" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="tilePlate_${tile.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#ffffff"/>
                        <stop offset="65%" stop-color="#f8fafc"/>
                        <stop offset="100%" stop-color="#edf2f7"/>
                    </linearGradient>
                    <linearGradient id="tileDepth_${tile.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#cbd5e1"/>
                        <stop offset="100%" stop-color="#94a3b8"/>
                    </linearGradient>
                    <filter id="engrave_${tile.id}">
                        <feDropShadow dx="0" dy="1.2" stdDeviation="0.4" flood-color="#ffffff" flood-opacity="0.95"/>
                        <feDropShadow dx="0" dy="-1.2" stdDeviation="0.6" flood-color="#000000" flood-opacity="0.25"/>
                    </filter>
                    <filter id="shadow_${tile.id}" x="-15%" y="-10%" width="130%" height="135%">
                        <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000000" flood-opacity="0.2"/>
                    </filter>
                </defs>

                <rect x="5" y="10" width="90" height="132" rx="7" fill="url(#tileDepth_${tile.id})" filter="url(#shadow_${tile.id})"/>
                <rect x="5" y="6" width="90" height="130" rx="6" fill="url(#tilePlate_${tile.id})" stroke="#ffffff" stroke-width="1.2"/>
                <path d="M 12 7 L 88 7 A 6 6 0 0 1 94 13 L 94 15 A 6 6 0 0 0 88 9 L 12 9 A 6 6 0 0 0 6 15 L 6 13 A 6 6 0 0 1 12 7 Z" fill="#ffffff" opacity="0.95"/>
                <ellipse cx="50" cy="56" rx="36" ry="44" fill="rgba(0,0,0,0.015)"/>
                ${innerSymbolSvg}
            </svg>
        `;

        return div;
    }

    function renderRack() {
        const container = document.getElementById('my-rack-container');
        if (!container) return;
        container.innerHTML = '';

        localRack.forEach((tile, index) => {
            // ★ 수정: 단순 tile.id 검사가 아니라 rack 출처와 고유 인덱스(또는 ID 일치)를 정밀하게 확인
            const isSel = selectedTiles.some(t => 
                t.source === 'rack' ? (t.rackIndex === index && t.id === tile.id) : (t.id === tile.id)
            );
            const div = createTileElement(tile, isSel);

            div.onclick = (e) => {
                e.stopPropagation();
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING') {
                    showToast("내 턴일 때만 조작할 수 있습니다.");
                    return;
                }

                playSoundEffect('click');
                if (isSel) {
                    selectedTiles = selectedTiles.filter(t => !(t.source === 'rack' && t.rackIndex === index));
                } else {
                    selectedTiles.push({ ...tile, source: 'rack', rackIndex: index });
                }
                renderRack();
                renderTable();
            };
            container.appendChild(div);
        });

        container.onclick = (e) => {
          // 내 턴이 아니어도 내 랙으로의 회수는 허용 (상대 턴 시뮬레이션 종료 지원)
          const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING');
          const hasTableTile = selectedTiles.some(t => t.source === 'table');
          if (!isMyTurn && hasTableTile) {
              showToast("상대방의 턴에는 바닥 타일을 회수할 수 없습니다.");
              return;
          }
          if (selectedTiles.length === 0) return;

          const selectedIds = new Set(selectedTiles.map(t => t.id));

          // 테이블 및 다중 스크래치 슬롯에서 제거
          if (isMyTurn) {
              localTableSets = localTableSets.map(set => set.filter(t => !selectedIds.has(t.id)));
              localTableSets = localTableSets.filter(s => s && s.length > 0);
          }
          localScratchSlots = localScratchSlots.map(slot => slot.filter(t => !selectedIds.has(t.id)));

          // 기존 랙에 이미 존재하는 타일 ID 집합
          const existingRackIds = new Set(localRack.map(t => t.id));

          selectedTiles.forEach(st => {
              // 이미 존재하는 타일이면 중복 push 차단
              if (!existingRackIds.has(st.id)) {
                  localRack.push({ id: st.id, color: st.color, number: st.number, is_joker: st.is_joker });
                  existingRackIds.add(st.id);
              }
          });

          playSoundEffect('place');
          selectedTiles = [];
          applyRackSort();
          renderRack();
          renderScratchpad();
          renderTable();
          showToast("선택한 타일을 거치대로 회수했습니다.");
      };
    }
	
	function updateScratchpadBadge() {
        const badge = document.getElementById('scratchpad-badge');
        if (!badge) return;
        const totalTiles = localScratchSlots.flat().length;
        badge.innerText = totalTiles;
        badge.style.display = totalTiles > 0 ? 'inline-block' : 'none';
    }

    function toggleScratchpad(forceState) {
        const panel = document.getElementById('scratchpad-panel');
        if (!panel) return;
        isScratchpadOpen = (forceState !== undefined) ? forceState : !isScratchpadOpen;
        if (isScratchpadOpen) panel.classList.add('active');
        else panel.classList.remove('active');
    }

    function renderScratchpad() {
        const container = document.getElementById('scratchpad-container');
        if (!container) return;
        container.innerHTML = '';
        updateScratchpadBadge();

        if (localScratchSlots.length === 0) {
            localScratchSlots.push([]);
        }

        let allValid = true;
        let totalTiles = 0;

        localScratchSlots.forEach((slot, slotIdx) => {
            totalTiles += slot.length;
            const isValid = isValidRummikubSet(slot);
            if (slot.length > 0 && !isValid) allValid = false;

            const slotBox = document.createElement('div');
            slotBox.className = 'scratch-slot-box' + (slot.length >= 3 && isValid ? ' valid-slot' : (slot.length > 0 ? ' invalid-slot' : ''));

            // 슬롯 헤더
            const slotHeader = document.createElement('div');
            slotHeader.className = 'scratch-slot-header';
            slotHeader.innerHTML = `
                <span>묶음 ${slotIdx + 1} ${slot.length >= 3 && isValid ? '✅' : (slot.length > 0 ? '⚠️' : '')}</span>
                ${localScratchSlots.length > 1 && slot.length === 0 ? `<button class="scratch-slot-del-btn" data-slot="${slotIdx}">✕ 삭제</button>` : ''}
            `;
            slotBox.appendChild(slotHeader);

            // 타일 거치 영역
            // 타일 거치 영역
            const tilesZone = document.createElement('div');
            tilesZone.className = 'scratch-slot-tiles';

            if (slot.length === 0) {
                const emptyMsg = document.createElement('span');
                emptyMsg.style.cssText = 'font-size:0.75rem; color:#94a3b8; padding: 18px 8px; user-select:none; pointer-events:none;';
                emptyMsg.innerText = '타일을 선택 후 여기를 클릭하세요';
                tilesZone.appendChild(emptyMsg);
            } else {
                slot.forEach((tile, tileIdx) => {
                    const isSel = selectedTiles.some(t => t.source === 'scratchpad' && t.slotIdx === slotIdx && t.tileIdx === tileIdx);
                    const div = createTileElement(tile, isSel);

                    // 임시작업대 내부 타일 시인성 보장 인라인 스타일
                    div.style.width = '42px';
                    div.style.height = '62px';
                    div.style.minWidth = '42px';
                    div.style.display = 'inline-flex';
                    div.style.visibility = 'visible';
                    div.style.opacity = '1';

                    div.onclick = (e) => {
                        e.stopPropagation();
                        playSoundEffect('click');
                        if (isSel) {
                            selectedTiles = selectedTiles.filter(t => !(t.source === 'scratchpad' && t.slotIdx === slotIdx && t.tileIdx === tileIdx));
                        } else {
                            selectedTiles.push({ ...tile, source: 'scratchpad', slotIdx, tileIdx });
                        }
                        renderRack();
                        renderScratchpad();
                        renderTable();
                    };
                    tilesZone.appendChild(div);
                });
            }

            // 슬롯 박스에 타일 거치 영역 등록
            slotBox.appendChild(tilesZone);

            // 해당 슬롯 여백 클릭 시: 선택된 타일들을 이 슬롯에 넣기
            slotBox.onclick = (e) => {
                if (e.target.closest('.scratch-slot-del-btn')) return;
                if (e.target.closest('.rummi-tile-wrapper')) return;
                if (selectedTiles.length === 0) return;

                // 상대방 턴일 때 바닥 타일 조작 금지 가드
                const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING');
                const hasTableTile = selectedTiles.some(t => t.source === 'table');
                if (!isMyTurn && hasTableTile) {
                    showToast("상대방의 턴에는 내 랙의 타일만 조합해볼 수 있습니다.");
                    return;
                }

                const selectedIds = new Set(selectedTiles.map(t => t.id));

                // 랙, 테이블, 다른 스크래치 슬롯에서 제거
                localRack = localRack.filter(t => !selectedIds.has(t.id));
                if (isMyTurn) {
                    localTableSets = localTableSets.map(set => set.filter(t => !selectedIds.has(t.id))).filter(s => s && s.length > 0);
                }
                localScratchSlots = localScratchSlots.map(s => s.filter(t => !selectedIds.has(t.id)));

                // 현재 슬롯에 추가
                selectedTiles.forEach(st => {
                    localScratchSlots[slotIdx].push({ id: st.id, color: st.color, number: st.number, is_joker: st.is_joker });
                });

                playSoundEffect('place');
                selectedTiles = [];
                renderRack();
                renderScratchpad();
                renderTable();
            };

            container.appendChild(slotBox);
        });

        // 일괄 등록 버튼 상태 갱신
        const deployBtn = document.getElementById('btn-scratchpad-deploy');
        if (deployBtn) {
            const hasCompleteSets = totalTiles >= 3 && allValid && localScratchSlots.some(s => s.length >= 3);
            const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING');

            if (isMyTurn && hasCompleteSets) {
                deployBtn.style.display = 'inline-flex';
                deployBtn.className = 'scratchpad-deploy-btn valid';
                deployBtn.innerText = `🚀 ${localScratchSlots.filter(s => s.length >= 3).length}개 세트 일괄 등록`;
            } else {
                deployBtn.style.display = 'none';
            }
        }
    }

    // 완성된 모든 슬롯의 세트를 바닥으로 동시 등록
    function deployAllScratchSlotsToTable() {
        const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING');
        if (!isMyTurn) {
            showToast("내 턴일 때만 테이블로 등록할 수 있습니다.");
            return;
        }

        const validSetsToDeploy = [];
        for (let i = 0; i < localScratchSlots.length; i++) {
            const slot = localScratchSlots[i];
            if (slot.length === 0) continue;
            if (!isValidRummikubSet(slot)) {
                showToast(`⚠️ [묶음 ${i + 1}]이 올바른 세트(3장 이상)가 아닙니다!`);
                return;
            }
            validSetsToDeploy.push(sortTileSetAuto([...slot]));
        }

        if (validSetsToDeploy.length === 0) {
            showToast("등록할 세트가 없습니다.");
            return;
        }

        validSetsToDeploy.forEach(s => localTableSets.push(s));
        localScratchSlots = [[]]; // 등록 후 빈 슬롯 1개로 리셋
        selectedTiles = [];
        toggleScratchpad(false); // 서랍 닫기

        playSoundEffect('place');
        showToast(`🚀 ${validSetsToDeploy.length}개의 세트를 테이블로 일괄 등록했습니다!`);
        renderRack();
        renderScratchpad();
        renderTable();
    }

    function renderTable() {
        const container = document.getElementById('table-sets-container');
        if (!container) return;
        
        // ★ 렌더링 시 자동 줌 배율 계산 적용
        evaluateAutoZoom();

        container.innerHTML = '';

        // 공유 테이블 빈 바닥 클릭 시: 선택된 타일들을 분리/추출하여 새로운 독립 세트로 생성
		container.onclick = (e) => {
			if (e.target.closest('.rummi-tile-wrapper')) return;
			if (e.target.closest('.tile-group-set')) return;

			if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
			if (selectedTiles.length === 0) return;

			const selectedIds = new Set(selectedTiles.map(t => t.id));

			// 1) 랙, 테이블, 다중 스크래치 슬롯에서 선택된 타일 제거
			localRack = localRack.filter(t => !selectedIds.has(t.id));
			localTableSets = localTableSets.map(set => set.filter(t => !selectedIds.has(t.id)));
			localTableSets = localTableSets.filter(s => s && s.length > 0);
			localScratchSlots = localScratchSlots.map(slot => slot.filter(t => !selectedIds.has(t.id)));

			// 2) 새 세트로 테이블에 추가
			const newSetRaw = selectedTiles.map(st => ({ 
				id: st.id, 
				color: st.color, 
				number: st.number, 
				is_joker: st.is_joker 
			}));
			localTableSets.push(sortTileSetAuto(newSetRaw));

			playSoundEffect('place');
			selectedTiles = [];
			showToast("선택한 타일로 새 세트를 만들었습니다.");
			renderRack();
			renderScratchpad();
			renderTable();
		};

        localTableSets = localTableSets.filter(s => s && s.length > 0);

        if (localTableSets.length === 0) {
            const emptyGuide = document.createElement('div');
            emptyGuide.className = 'table-empty-guide';
            emptyGuide.innerText = selectedTiles.length > 0 
                ? '🧩 선택한 타일을 여기(공유 테이블)를 클릭하여 새 세트로 내놓으세요!' 
                : '공유 테이블이 비어있습니다.';
            emptyGuide.style.pointerEvents = 'none';
            container.appendChild(emptyGuide);
            updateSubmitButtonHighlight();
            return;
        }

        localTableSets.forEach((set, setIndex) => {
            const setEl = document.createElement('div');
            const isValid = isValidRummikubSet(set);
            setEl.className = 'tile-group-set' + (isValid ? '' : ' invalid-set');

            set.forEach((tile, tileIndex) => {
                const isSel = selectedTiles.some(t => t.id === tile.id);
                const div = createTileElement(tile, isSel);

                if (newlyPlacedTileIds.has(tile.id)) {
                    div.classList.add('just-placed');
                }

                // 타일 클릭: 타일 단일 선택/해제 토글 (복수 선택 유지)
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) {
                        showToast("내 턴일 때만 조작할 수 있습니다.");
                        return;
                    }

                    playSoundEffect('click');
                    if (isSel) {
                        selectedTiles = selectedTiles.filter(t => t.id !== tile.id);
                    } else {
                        selectedTiles.push({ ...tile, source: 'table', setIndex, tileIndex });
                    }
                    renderRack();
                    renderTable();
                };

                setEl.appendChild(div);
            });

            // 세트 트레이 여백 클릭 시: 선택된 타일들을 이 세트에 결합 (Merge)
            setEl.onclick = (e) => {
                e.stopPropagation();
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
                if (selectedTiles.length === 0) return;

                const onlyFromThisSet = selectedTiles.every(st => st.source === 'table' && st.setIndex === setIndex);
                if (onlyFromThisSet) return;

                mergeSelectedTilesIntoSet(setIndex);
            };

            container.appendChild(setEl);
        });

        updateSubmitButtonHighlight();
    }

    function updateSubmitButtonHighlight() {
        const submitBtn = document.getElementById('btn-submit-turn');
        if (submitBtn) {
            const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id));
            const originalTableCount = (initialTurnTableSets || []).flat().length;
            const currentTableCount = localTableSets.flat().length;
            const isTilePlaced = currentTableCount > originalTableCount;

            if (isMyTurn && isTilePlaced) {
                submitBtn.classList.add('highlight-submit');
            } else {
                submitBtn.classList.remove('highlight-submit');
            }
        }
    }

    function mergeSelectedTilesIntoSet(targetSetIndex) {
		const selectedIds = new Set(selectedTiles.map(t => t.id));

		// 1) 랙, 테이블, 다중 스크래치 슬롯에서 제거
		localRack = localRack.filter(t => !selectedIds.has(t.id));
		localTableSets = localTableSets.map(set => set.filter(t => !selectedIds.has(t.id)));
		localScratchSlots = localScratchSlots.map(slot => slot.filter(t => !selectedIds.has(t.id)));

		const rawTiles = selectedTiles.map(st => ({ 
			id: st.id, 
			color: st.color, 
			number: st.number, 
			is_joker: st.is_joker 
		}));

		// 2) 대상 세트에 합치고 자동 정렬
		if (localTableSets[targetSetIndex]) {
			localTableSets[targetSetIndex] = sortTileSetAuto([...localTableSets[targetSetIndex], ...rawTiles]);
		} else {
			localTableSets.push(sortTileSetAuto(rawTiles));
		}

		localTableSets = localTableSets.filter(s => s && s.length > 0);

		playSoundEffect('place');
		selectedTiles = [];
		showToast("타일을 해당 세트에 합쳤습니다.");
		renderRack();
		renderScratchpad(); // ★ 이 줄 추가
		renderTable();
	}

    function renderPlayers() {
        const panel = document.getElementById('panel-players');
        const countSpan = document.getElementById('player-count');
        const mobilePlayerCount = document.getElementById('mobile-player-count');
        if (!panel || !roomState) return;

        panel.innerHTML = '';
        if (countSpan) countSpan.innerText = roomState.players.length;
        if (mobilePlayerCount) mobilePlayerCount.innerText = roomState.players.length;

        const playersList = roomState ? roomState.players : [];

        const mvpEl = document.getElementById('rank-mvp-text');
        if (mvpEl && playersList.length > 0) {
            const sorted = [...playersList].sort((a, b) => (b.wins || 0) - (a.wins || 0));
            const maxWins = sorted[0]?.wins || 0;
            if (maxWins > 0) {
                const topWinners = sorted.filter(p => (p.wins || 0) === maxWins);
                mvpEl.innerText = topWinners.length === 1 
                    ? `${topWinners[0].nickname} (${maxWins}승)` 
                    : `${topWinners[0].nickname} 외 ${topWinners.length - 1}명 (${maxWins}승)`;
            } else {
                mvpEl.innerText = '집계 중...';
            }
        }

        const todayKingEl = document.getElementById('today-king-name-text');
        if (todayKingEl) {
            const todayKing = roomState ? roomState.today_king : null;
            if (todayKing && todayKing.wins > 0) {
                todayKingEl.innerText = `${todayKing.nickname} (🏆 ${todayKing.wins}승)`;
            } else {
                todayKingEl.innerText = "왕좌 비어있음";
            }
        }

        playersList.forEach(p => {
            const card = document.createElement('div');
            const isTurnPlayer = (String(p.player_id) === String(roomState.current_turn_player_id) && roomState.status === 'PLAYING');
            card.className = 'player-card' + (isTurnPlayer ? ' active-turn' : '');

            const nickname = String(p.nickname || '참여자');
            const firstLetter = nickname.charAt(0).toUpperCase();
            const avatarColor = p.color || 'var(--bg-surface)';
            const tileCount = p.tile_count || 0;

            const isDanger = (roomState.status === 'PLAYING' && tileCount > 0 && tileCount <= 3);
            const dangerBadge = isDanger ? `<span style="color:#ef4444; font-weight:800; font-size:0.7rem;">⚠️${tileCount}장!</span>` : '';

            let statusHtml = (roomState.status === 'WAITING' || !roomState.status)
                ? (p.is_ready ? '<span style="color:#16a34a; font-weight:bold; font-size:0.75rem;">준비 완료</span>' : '<span style="color:#94a3b8; font-size:0.75rem;">대기 중</span>')
                : `<span style="font-size:0.75rem; font-weight:bold; color:var(--brand-blue);">${tileCount}장 ${isTurnPlayer ? '🎯' : ''}</span> ${dangerBadge}`;

            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${avatarColor};">${firstLetter}</div>
                    <div class="player-name">${escapeHtml(nickname)} ${p.is_host ? '<span style="font-size:0.65rem; color:var(--brand-blue); border:1px solid; border-radius:3px; padding:0 2px;">방장</span>' : ''}</div>
                </div>
                <div>${statusHtml}</div>
            `;
            panel.appendChild(card);
        });
    }

    function renderChatLogs() {
        const chatBox = document.getElementById('chat-messages');
        if (!chatBox || !roomState) return;
        chatBox.innerHTML = '';

        const myNick = localStorage.getItem('office_rummikub_last_nickname');
        const logs = (roomState.chat_logs || []).filter(c => !c.system);

        logs.forEach((chat, idx) => {
            const isMine = (chat.nickname === myNick);
            const row = document.createElement('div');
            row.className = `chat-bubble-row ${isMine ? 'mine' : 'other'}`;

            const chatTime = chat.timestamp ? new Date(chat.timestamp) : new Date();
            const timeStr = chatTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const nextChat = logs[idx + 1];
            let showTime = true;
            if (nextChat && nextChat.nickname === chat.nickname) {
                const nextTime = nextChat.timestamp ? new Date(nextChat.timestamp) : new Date();
                const nextTimeStr = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (nextTimeStr === timeStr) {
                    showTime = false;
                }
            }

            const prevChat = logs[idx - 1];
            const isFirstFromSender = !prevChat || prevChat.nickname !== chat.nickname;

            row.innerHTML = `
                ${(!isMine && isFirstFromSender) ? `<span class="chat-sender-name" style="color:${chat.color || '#64748b'}">${escapeHtml(chat.nickname)}</span>` : ''}
                <div class="bubble">${escapeHtml(chat.text)}</div>
                ${showTime ? `<span class="chat-time">${timeStr}</span>` : ''}
            `;
            chatBox.appendChild(row);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function escapeHtml(str) { 
        return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); 
    }

    function showWinnerModal(winnerName) {
        const finalWinner = String(winnerName || '알 수 없는 플레이어').trim();
        let modal = document.getElementById('winner-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'winner-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        // 모달이 이미 존재하더라도 우승자 닉네임을 반드시 새로 반영하여 렌더링
        modal.innerHTML = `
            <div class="modal-box" style="text-align: center; padding: 24px;">
                <div style="font-size: 3.5rem; margin-bottom: 10px;">🏆</div>
                <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 8px;">최종 우승!</h2>
                <p style="font-size: 1.05rem; color: var(--brand-blue); font-weight: bold; margin-bottom: 16px;">
                    [${escapeHtml(finalWinner)}] 님이 승리하셨습니다!
                </p>
                <p style="font-size: 0.8rem; color: var(--text-muted);">잠시 후 대기실로 이동합니다...</p>
            </div>
        `;
        modal.classList.add('active');
        setTimeout(() => { if (modal) modal.classList.remove('active'); }, 3500);
    }

    function initGameControls() {
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        const hostStartBtn = document.getElementById('btn-host-start');
        const btnHostReset = document.getElementById('btn-host-reset');
        const btnResetConfirm = document.getElementById('btn-reset-confirm');
        const btnResetCancel = document.getElementById('btn-reset-cancel');
        const resetOptionModal = document.getElementById('reset-option-modal');

        const btnSortColor = document.getElementById('btn-sort-color');
        const btnSortNumber = document.getElementById('btn-sort-number');
        const btnResetTurn = document.getElementById('btn-reset-turn');
        const btnSubmitTurn = document.getElementById('btn-submit-turn');
        const btnCopyLink = document.getElementById('btn-copy-link');

        const btnZoomOut = document.getElementById('btn-zoom-out');
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomAuto = document.getElementById('btn-zoom-auto');
        const tableBoard = document.getElementById('table-sets-container');
		
        // 임시작업대 토글 및 컨트롤 버튼 바인딩
        const btnToggleScratch = document.getElementById('btn-toggle-scratchpad');
        const btnCloseScratch = document.getElementById('btn-close-scratchpad');
        const btnAddSlot = document.getElementById('btn-add-scratch-slot');
        const btnDeployScratch = document.getElementById('btn-scratchpad-deploy');

        if (btnToggleScratch) btnToggleScratch.onclick = () => toggleScratchpad();
        if (btnCloseScratch) btnCloseScratch.onclick = () => toggleScratchpad(false);
        if (btnAddSlot) {
            btnAddSlot.onclick = (e) => {
                e.stopPropagation();
                if (localScratchSlots.length >= 4) {
                    showToast("임시 작업대 슬롯은 최대 4개까지 생성할 수 있습니다.");
                    return;
                }
                localScratchSlots.push([]);
                renderScratchpad();
            };
        }
        if (btnDeployScratch) {
            btnDeployScratch.onclick = (e) => {
                e.stopPropagation();
                deployAllScratchSlotsToTable();
            };
        }

        // 빈 슬롯 삭제 이벤트 위임
        const scratchContainer = document.getElementById('scratchpad-container');
        if (scratchContainer) {
            scratchContainer.onclick = (e) => {
                const delBtn = e.target.closest('.scratch-slot-del-btn');
                if (delBtn) {
                    e.stopPropagation();
                    const idx = parseInt(delBtn.getAttribute('data-slot'));
                    if (!isNaN(idx) && localScratchSlots[idx] && localScratchSlots[idx].length === 0) {
                        localScratchSlots.splice(idx, 1);
                        renderScratchpad();
                    }
                }
            };
        }

        // 줌 위젯 바인딩
        if (btnZoomOut) {
            btnZoomOut.onclick = (e) => {
                e.stopPropagation();
                isAutoZoomMode = false;
                setTableZoom(tableZoomScale - 0.08);
            };
        }
        if (btnZoomIn) {
            btnZoomIn.onclick = (e) => {
                e.stopPropagation();
                isAutoZoomMode = false;
                setTableZoom(tableZoomScale + 0.08);
            };
        }
        if (btnZoomAuto) {
            btnZoomAuto.onclick = (e) => {
                e.stopPropagation();
                isAutoZoomMode = true;
                evaluateAutoZoom();
                showToast("세트 수에 맞춰 자동 배율로 정렬되었습니다.");
            };
        }
        if (tableBoard) {
            tableBoard.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    isAutoZoomMode = false;
                    const delta = e.deltaY < 0 ? 0.05 : -0.05;
                    setTableZoom(tableZoomScale + delta);
                }
            }, { passive: false });
        }

        const mobileFabBtn = document.getElementById('mobile-fab-btn');
        const sidebarPanel = document.getElementById('sidebar-panel');
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

        if (mobileFabBtn && sidebarPanel) {
            mobileFabBtn.onclick = () => sidebarPanel.classList.add('active');
        }
        if (mobileSidebarClose && sidebarPanel) {
            mobileSidebarClose.onclick = () => sidebarPanel.classList.remove('active');
        }

        if (btnToggleReady) btnToggleReady.onclick = () => sendMessage({ type: 'TOGGLE_READY' });
        if (hostStartBtn) hostStartBtn.onclick = () => sendMessage({ type: 'START_GAME', room_id: currentRoomId });

        if (btnHostReset) btnHostReset.onclick = () => { if (resetOptionModal) resetOptionModal.classList.add('active'); };
        if (btnResetConfirm) {
            btnResetConfirm.onclick = () => {
                sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId });
                if (resetOptionModal) resetOptionModal.classList.remove('active');
            };
        }
        if (btnResetCancel) btnResetCancel.onclick = () => { if (resetOptionModal) resetOptionModal.classList.remove('active'); };

        if (btnSortColor) {
            btnSortColor.onclick = () => {
                currentSortMode = 'color';
                applyRackSort();
                renderRack();
                showToast("타일을 색상별로 정렬했습니다.");
            };
        }

        if (btnSortNumber) {
            btnSortNumber.onclick = () => {
                currentSortMode = 'number';
                applyRackSort();
                renderRack();
                showToast("타일을 숫자별로 정렬했습니다.");
            };
        }

        if (btnResetTurn) {
            btnResetTurn.onclick = () => {
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;

                localRack = JSON.parse(JSON.stringify(initialTurnRack));
                localTableSets = JSON.parse(JSON.stringify(initialTurnTableSets));
                localScratchSlots = [[]]; // 턴 시작 상태로 임시 보관함 초기화

                selectedTiles = [];
                applyRackSort();
                renderRack();
                renderScratchpad();
                renderTable();
                showToast("이번 턴에 조작한 내용을 턴 시작 상태로 되돌렸습니다.");
            };
        }

        if (btnSubmitTurn) {
            btnSubmitTurn.onclick = () => {
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) {
                    showToast("내 턴일 때만 조작할 수 있습니다!");
                    return;
                }

                // 안전 가드: 다중 슬롯 전체 타일 검증
                const totalScratchTiles = localScratchSlots.flat().length;
                if (totalScratchTiles > 0) {
                    showToast("⚠️ 임시 작업대에 타일이 남아있습니다! 거치대나 테이블로 이동 후 턴을 마쳐주세요.");
                    toggleScratchpad(true); // 비울 수 있도록 자동으로 서랍 열기
                    return;
                }

                selectedTiles = [];
                localTableSets = localTableSets.filter(s => s && s.length > 0);

                const invalidSet = localTableSets.find(s => !isValidRummikubSet(s));
                if (invalidSet) {
                    showToast("⚠️ 공유 테이블에 올바르지 않은 세트가 존재합니다!");
                    renderTable();
                    return;
                }

                const originalTableCount = (initialTurnTableSets || []).flat().length;
                const currentTableCount = localTableSets.flat().length;
                const isTilePlaced = currentTableCount > originalTableCount;

                const myPlayer = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
                if (myPlayer && !myPlayer.has_opened && isTilePlaced) {
                    const ruleType = roomState.rule_type || 'official';
                    const initialTileIds = new Set((initialTurnTableSets || []).flat().map(t => t.id));
                    const newlyPlacedSets = localTableSets.filter(set => 
                        isValidRummikubSet(set) && set.some(t => !initialTileIds.has(t.id))
                    );

                    if (ruleType === 'jaehee') {
                        const hasSingleSetOver30 = newlyPlacedSets.some(set => calculateSetScore(set) >= 30);
                        if (!hasSingleSetOver30) {
                            showToast(`⚠️ [재히룰] 첫 등록은 단일 세트 30점 이상이어야 합니다!`);
                            return;
                        }
                    } else {
                        let newlyPlacedScore = 0;
                        newlyPlacedSets.forEach(set => { newlyPlacedScore += calculateSetScore(set); });
                        if (newlyPlacedScore < 30) {
                            showToast(`⚠️ [공식 룰] 첫 등록 점수 합계가 30점 이상이어야 합니다! (현재: ${newlyPlacedScore}점)`);
                            return;
                        }
                    }
                }

                clearInterval(timerInterval);
                btnSubmitTurn.disabled = true;
                if (isTilePlaced) {
                    showToast("타일 배치를 완료하고 턴을 넘깁니다.");
                } else {
                    showToast("타일 1장을 가져오고 턴을 넘깁니다.");
                }

                initialTurnTableSets = JSON.parse(JSON.stringify(localTableSets));
                initialTurnRack = JSON.parse(JSON.stringify(localRack));
                previousTurnPlayerId = null; 

                sendMessage({ type: 'SUBMIT_TURN', room_id: currentRoomId, table_sets: localTableSets, rack: localRack });
                setTimeout(() => { if (btnSubmitTurn) btnSubmitTurn.disabled = false; }, 1000);
            };
        }

        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const shareUrl = `${window.location.origin}/index.html?game=rummikub&room=${currentRoomId}`;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!'));
                } else {
                    prompt('초대 링크:', shareUrl);
                }
            };
        }
    }

    function initFormControls() {
        const createForm = document.getElementById('create-room-form');
        const joinForm = document.getElementById('join-room-form');

        const savedNick = localStorage.getItem('office_rummikub_last_nickname');
        if (savedNick) {
            const cNick = document.getElementById('create-nickname');
            const jNick = document.getElementById('join-nickname');
            if (cNick) cNick.value = savedNick;
            if (jNick) jNick.value = savedNick;
        }

        if (createForm) {
            createForm.onsubmit = (e) => {
                e.preventDefault();
                const nick = document.getElementById('create-nickname')?.value.trim() || '루미마스터';
                saveMyNickname(nick);

                const titleInput = document.getElementById('create-title');
                const title = titleInput ? titleInput.value.trim() : '실시간 루미큐브';
                const selectedRule = document.querySelector('input[name="rule_type"]:checked')?.value || 'official';

                sendMessage({
                    type: 'CREATE_ROOM',
                    game_type: 'RUMMIKUB',
                    title: title,
                    nickname: nick,
                    turn_time_limit: selectedTimeLimit,
                    rule_type: selectedRule
                });
            };
        }

        if (joinForm) {
            joinForm.onsubmit = (e) => {
                e.preventDefault();
                const nick = document.getElementById('join-nickname')?.value.trim() || '도전자';
                saveMyNickname(nick);
                const codeInput = document.getElementById('join-room-code');

                sendMessage({
                    type: 'JOIN_ROOM',
                    nickname: nick,
                    room_id: codeInput ? codeInput.value.trim().toUpperCase() : ''
                });
            };
        }

        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        if (chatForm) {
            chatForm.onsubmit = (e) => {
                e.preventDefault();
                if (chatInput && chatInput.value.trim()) {
                    sendMessage({ type: 'CHAT_MESSAGE', room_id: currentRoomId, message: chatInput.value.trim() });
                    chatInput.value = '';
                    chatInput.focus();
                }
            };
        }
    }

    function initDelegations() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('#btn-help')) document.getElementById('help-modal')?.classList.add('active');
            if (e.target.matches('#help-modal-close')) document.getElementById('help-modal')?.classList.remove('active');
            
            const timeBtn = e.target.closest('.time-btn');
            if (timeBtn) {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
                timeBtn.classList.add('selected');
                selectedTimeLimit = parseInt(timeBtn.getAttribute('data-time')) || 60;
            }

            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');
                const isCreate = tabBtn.id === 'tab-btn-create';
                const createForm = document.getElementById('create-room-form');
                const joinForm = document.getElementById('join-room-form');
                if (createForm) createForm.style.display = isCreate ? 'block' : 'none';
                if (joinForm) joinForm.style.display = isCreate ? 'none' : 'block';
            }
        });
    }

    initDelegations();
    initGameControls();
    initFormControls();
    connectNetwork();
})();