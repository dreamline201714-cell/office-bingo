/**
 * Office Rummikub Live Client Application Logic - Fully Improved & Fixed
 */
(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let roomState = null;
    let previousTurnPlayerId = null;

    // 턴 시작 시점의 복사본 (무르기/초기화용)
    let initialTurnRack = [];
    let initialTurnTableSets = [];

    let selectedTiles = []; 
    let localRack = [];
    let localTableSets = [];
    let currentSortMode = 'none'; 
    let selectedTimeLimit = 60; 

    let timerInterval = null;
    let timerSecondsLeft = 60;
    let soundEnabled = true;
    let currentTheme = 'light';

    // Web Audio API 합성 오디오 효과음 시스템
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
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
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
                    if (brandIconEl) brandIconEl.innerText = '🧩';
                    if (brandTitleEl) brandTitleEl.innerHTML = 'Office Rummikub <small style="font-size:0.65rem; color:var(--border-accent); vertical-align:super;">LIVE</small>';
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

        if (btnHelp && helpModal) {
            btnHelp.onclick = (e) => {
                e.preventDefault();
                helpModal.classList.add('active');
            };
        }
        if (helpModalClose && helpModal) {
            helpModalClose.onclick = (e) => {
                e.preventDefault();
                helpModal.classList.remove('active');
            };
        }

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
            
            // 이미 방에 들어가 있던 상태에서 소켓이 재연결된 경우 자동 재입장 요청
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
            if(statusEl) statusEl.innerText = '연결 끊김';
            setTimeout(connectNetwork, 2000);
        };
    }

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
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
            const hasThirteen = nonJokers.some(t => t.number === 13);
            if (hasThirteen && jokers.length > 0) {
                return [...jokers, ...nonJokers];
            }
            return [...nonJokers, ...jokers];
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
            const uniqueColors = new Set(colors);
            if (colors.length === uniqueColors.size && set.length <= 4) return true;
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
            const actualJokers = set.length - nonJokers.length;
            if (actualJokers >= neededJokers) return true;
        }

        return false;
    }

    function calculateSetScore(set) {
        if (!set) return 0;
        const nonJokers = set.filter(t => !t.is_joker);
        const jokerCount = set.length - nonJokers.length;
        if (nonJokers.length === 0) return 0;

        const isGroup = nonJokers.every(t => t.number === nonJokers[0].number);
        if (isGroup) {
            return nonJokers[0].number * set.length;
        }

        const isSameColor = nonJokers.every(t => t.color === nonJokers[0].color);
        if (isSameColor) {
            const sorted = [...nonJokers].sort((a, b) => a.number - b.number);
            let scoreSum = sorted.reduce((acc, curr) => acc + curr.number, 0);

            if (jokerCount > 0) {
                let minNum = sorted[0].number;
                let maxNum = sorted[sorted.length - 1].number;

                for (let i = 0; i < jokerCount; i++) {
                    if (maxNum >= 13) {
                        minNum -= 1;
                        scoreSum += minNum;
                    } else {
                        maxNum += 1;
                        scoreSum += maxNum;
                    }
                }
            }
            return scoreSum;
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

    function updateUI(isFirstJoin) {
        if (!roomState) return;

        const status = roomState.status;
        const myPlayer = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
        const readyBtn = document.getElementById('btn-toggle-ready');
        const turnBanner = document.getElementById('turn-banner');
        const turnPlayerBadge = document.getElementById('turn-player-badge');
        const hostControls = document.getElementById('host-controls');
        const hostStartBtn = document.getElementById('btn-host-start');
        const roomBadge = document.getElementById('room-state-badge');

        document.getElementById('display-room-code').innerText = roomState.room_id;
        
        const gridInfoEl = document.getElementById('display-grid-info');
        if (gridInfoEl) {
            const poolCount = roomState.tile_pool_count !== undefined ? roomState.tile_pool_count : '-';
            const ruleText = roomState.rule_type === 'jaehee' ? '재히룰(단일세트 30점)' : '공식룰(합산 30점)';
            gridInfoEl.innerText = `룰: ${ruleText} | 턴 제한: ${roomState.turn_time_limit || 60}초 | 남은 타일 더미: ${poolCount}개`;
        }

        if (status === 'WAITING') {
            if (roomBadge) { roomBadge.className = 'room-state-badge waiting'; roomBadge.innerText = '대기 중'; }
            if (turnBanner) turnBanner.style.display = 'none';
            if (readyBtn) {
                readyBtn.style.display = 'inline-block';
                if (myPlayer) readyBtn.innerText = myPlayer.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
            }

           if (myPlayer && myPlayer.is_host) {
                if (hostControls) hostControls.style.display = 'flex';
                if (hostStartBtn) {
                    // 대기실 상태로 돌아왔을 때 로딩 상태 강제 해제
                    hostStartBtn.removeAttribute('data-loading');
                    
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

            if (isMyTurn && String(previousTurnPlayerId) !== String(myPlayerId)) {
                playSoundEffect('turn');
                showToast("🧩 당신의 턴입니다! 자유 조합을 시작하세요!");
                selectedTiles = [];
                if (myPlayer && myPlayer.rack) {
                    initialTurnRack = JSON.parse(JSON.stringify(myPlayer.rack));
                }
                initialTurnTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
            }
            previousTurnPlayerId = roomState.current_turn_player_id;

            startClientTurnTimer(roomState.turn_time_remaining || 60, roomState.turn_time_limit || 60);
        }

        if (myPlayer && myPlayer.rack) {
            localRack = [...myPlayer.rack];
            applyRackSort();
        }

        localTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
        localTableSets = localTableSets.map(set => sortTileSetAuto(set));

        renderRack();
        renderTable();
        renderPlayers();
        renderChatLogs();
    }

    // ★ 턴 제한시간 카운트다운 및 타임아웃 시 자동 제출 처리 함수 ★
    function startClientTurnTimer(secondsLeft, totalLimit) {
        clearInterval(timerInterval);
        timerSecondsLeft = secondsLeft;
        updateTimerBar(totalLimit);

        timerInterval = setInterval(() => {
            timerSecondsLeft--;
            if (timerSecondsLeft <= 0) {
                timerSecondsLeft = 0;
                clearInterval(timerInterval);

                // 시간 초과 시 내 턴이고 배치가 유효하면 자동 제출 실행
                const isMyTurn = (String(myPlayerId) === String(roomState?.current_turn_player_id));
                if (isMyTurn) {
                    const originalTableCount = (initialTurnTableSets || []).flat().length;
                    const currentTableCount = localTableSets.flat().length;
                    const isTilePlaced = currentTableCount > originalTableCount;
                    const invalidSet = localTableSets.find(s => !isValidRummikubSet(s));

                    // 첫 등록 자격 검증 (시간 초과 시 적용)
                    const myPlayer = roomState?.players?.find(p => String(p.player_id) === String(myPlayerId));
                    let isMeldValid = true;

                    if (myPlayer && !myPlayer.has_opened && isTilePlaced) {
                        const ruleType = roomState.rule_type || 'official';
                        const validPlacedSets = localTableSets.filter(set => isValidRummikubSet(set));

                        if (ruleType === 'jaehee') {
                            isMeldValid = validPlacedSets.some(set => calculateSetScore(set) >= 30);
                        } else {
                            let totalScore = 0;
                            validPlacedSets.forEach(set => { totalScore += calculateSetScore(set); });
                            isMeldValid = (totalScore >= 30);
                        }
                    }

                    // 배치 세트가 올바르고 첫 등록 조건까지 만족할 때만 자동 제출
                    if (isTilePlaced && !invalidSet && isMeldValid) {
                        showToast("⏱️ 제한 시간이 초과되어 현재 배치가 자동으로 제출되었습니다!");
                        sendMessage({ type: 'SUBMIT_TURN', room_id: currentRoomId, table_sets: localTableSets, rack: localRack });
                    } else {
                        // 첫 등록 미달 또는 유효하지 않은 배치인 경우 원위치 후 타일 1장 패스 처리
                        showToast("⏱️ 첫 등록 점수 미달 또는 올바르지 않은 배치로 인해 이번 턴 변경 사항이 취소되고 타일을 가져옵니다.");
                        localRack = JSON.parse(JSON.stringify(initialTurnRack));
                        localTableSets = JSON.parse(JSON.stringify(initialTurnTableSets));
                        selectedTiles = [];
                        applyRackSort();
                        renderRack();
                        renderTable();
                        sendMessage({ type: 'SUBMIT_TURN', room_id: currentRoomId, table_sets: localTableSets, rack: localRack });
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

    function renderRack() {
        const container = document.getElementById('my-rack-container');
        if (!container) return;
        container.innerHTML = '';

        localRack.forEach((tile, index) => {
            const isSel = selectedTiles.some(t => t.id === tile.id);
            const div = document.createElement('div');
            div.className = `rummi-tile tile-${tile.color} ${isSel ? 'selected' : ''}`;
            div.innerText = tile.is_joker ? '★' : tile.number;

            div.onclick = (e) => {
                e.stopPropagation();
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id) && roomState?.status === 'PLAYING') {
                    showToast("내 턴일 때만 조작할 수 있습니다.");
                    return;
                }

                playSoundEffect('click');
                if (isSel) {
                    selectedTiles = selectedTiles.filter(t => t.id !== tile.id);
                } else {
                    selectedTiles.push({ ...tile, source: 'rack', rackIndex: index });
                }
                renderRack();
                renderTable();
            };
            container.appendChild(div);
        });

        container.onclick = (e) => {
            if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
            const tableSelected = selectedTiles.filter(st => st.source === 'table');
            if (tableSelected.length === 0) return;

            tableSelected.forEach(st => {
                if (localTableSets[st.setIndex]) {
                    localTableSets[st.setIndex] = localTableSets[st.setIndex].filter(t => t.id !== st.id);
                }
                localRack.push({ id: st.id, color: st.color, number: st.number, is_joker: st.is_joker });
            });

            playSoundEffect('place');
            selectedTiles = [];
            applyRackSort();
            renderRack();
            renderTable();
            showToast("선택한 타일을 내 거치대로 회수했습니다.");
        };
    }

    function renderTable() {
        const container = document.getElementById('table-sets-container');
        if (!container) return;
        container.innerHTML = '';

        if (localTableSets.length === 0) {
            const emptyGuide = document.createElement('div');
            emptyGuide.style.cssText = 'width:100%; text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.88rem; border:1px dashed var(--border-block); border-radius:6px;';
            emptyGuide.innerText = selectedTiles.length > 0 
                ? '🧩 선택한 타일을 여기(공유 테이블)를 클릭하여 새 세트로 내놓으세요!' 
                : '공유 테이블이 비어있습니다.';
            container.appendChild(emptyGuide);
        }

        localTableSets = localTableSets.filter(s => s && s.length > 0);

        localTableSets.forEach((set, setIndex) => {
            const setEl = document.createElement('div');
            const isValid = isValidRummikubSet(set);
            setEl.className = 'tile-group-set' + (isValid ? '' : ' invalid-set');

            set.forEach((tile, tileIndex) => {
                const isSel = selectedTiles.some(t => t.id === tile.id);
                const div = document.createElement('div');
                div.className = `rummi-tile tile-${tile.color} ${isSel ? 'selected' : ''}`;
                div.innerText = tile.is_joker ? '★' : tile.number;

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

            setEl.onclick = (e) => {
                e.stopPropagation();
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
                if (selectedTiles.length === 0) return;

                selectedTiles.forEach(st => {
                    if (st.source === 'rack') {
                        localRack = localRack.filter(t => t.id !== st.id);
                    } else if (st.source === 'table') {
                        if (localTableSets[st.setIndex]) {
                            localTableSets[st.setIndex] = localTableSets[st.setIndex].filter(t => t.id !== st.id);
                        }
                    }
                });

                const rawTiles = selectedTiles.map(st => ({ id: st.id, color: st.color, number: st.number, is_joker: st.is_joker }));
                localTableSets[setIndex] = sortTileSetAuto([...localTableSets[setIndex], ...rawTiles]);

                playSoundEffect('place');
                selectedTiles = [];
                showToast("타일을 해당 세트에 합치고 자동으로 순서를 정렬했습니다.");
                renderRack();
                renderTable();
            };

            container.appendChild(setEl);
        });

        container.onclick = () => {
            if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
            if (selectedTiles.length === 0) return;

            selectedTiles.forEach(st => {
                if (st.source === 'rack') {
                    localRack = localRack.filter(t => t.id !== st.id);
                } else if (st.source === 'table') {
                    if (localTableSets[st.setIndex]) {
                        localTableSets[st.setIndex] = localTableSets[st.setIndex].filter(t => t.id !== st.id);
                    }
                }
            });

            const newSetRaw = selectedTiles.map(st => ({ id: st.id, color: st.color, number: st.number, is_joker: st.is_joker }));
            localTableSets.push(sortTileSetAuto(newSetRaw));

            playSoundEffect('place');
            selectedTiles = [];
            showToast("선택한 타일로 새 묶음을 만들었습니다.");
            renderRack();
            renderTable();
        };

        // ★ [추가] 내가 내놓은 타일이 존재할 경우 제출 버튼 시각적 강조 제어 ★
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
            const dangerBadge = isDanger ? `<span class="danger-tile-badge">⚠️ ${tileCount}개 남음!</span>` : '';

            let statusHtml = (roomState.status === 'WAITING' || !roomState.status)
                ? (p.is_ready ? '<span class="ready-tag ready">준비 완료</span>' : '<span class="ready-tag waiting">작성 중...</span>')
                : `<span style="font-size:0.75rem; font-weight:bold; color:var(--border-accent);">타일 ${tileCount}개 ${isTurnPlayer ? '🎯' : ''}</span> ${dangerBadge}`;

            const winCount = p.wins || 0;
            const winBadgeHtml = winCount > 0 ? `<span class="win-count-badge">👑 ${winCount}승</span>` : '';

            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${avatarColor};">${firstLetter}</div>
                    <div class="player-name">${escapeHtml(nickname)} ${p.is_host ? '<span class="host-tag">방장</span>' : ''} ${winBadgeHtml}</div>
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

    function initGlobalClickDelegation() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('#btn-help') || e.target.closest('#btn-help')) {
                const helpModal = document.getElementById('help-modal');
                if (helpModal) helpModal.classList.add('active');
                return;
            }

            if (e.target.matches('#help-modal-close') || e.target.closest('#help-modal-close')) {
                const helpModal = document.getElementById('help-modal');
                if (helpModal) helpModal.classList.remove('active');
                return;
            }

            const timeBtn = e.target.closest('.time-btn');
            if (timeBtn) {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
                timeBtn.classList.add('selected');
                selectedTimeLimit = parseInt(timeBtn.getAttribute('data-time')) || 60;
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

    function showWinnerModal(winnerName) {
        const finalWinner = String(winnerName || '우승자').trim();
        let modal = document.getElementById('winner-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'winner-modal';
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal-box" style="text-align: center; padding: 24px;">
                    <div style="font-size: 3.5rem; margin-bottom: 10px;">🏆</div>
                    <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 8px;">최종 우승!</h2>
                    <p id="winner-modal-text" style="font-size: 1rem; color: var(--border-accent); font-weight: bold; margin-bottom: 16px;">
                        [${escapeHtml(finalWinner)}] 님이 승리하셨습니다!
                    </p>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">잠시 후 대기실로 자동 이동합니다...</p>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            const modalText = document.getElementById('winner-modal-text');
            if (modalText) {
                modalText.innerHTML = `[${escapeHtml(finalWinner)}] 님이 승리하셨습니다!`;
            }
            modal.classList.add('active');
        }

        setTimeout(() => {
            if (modal) modal.classList.remove('active');
        }, 3500);
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
        const btnShowQr = document.getElementById('btn-show-qr');
        const qrModal = document.getElementById('qr-modal');
        const qrModalClose = document.getElementById('qr-modal-close');

        if (btnToggleReady) btnToggleReady.onclick = () => sendMessage({ type: 'TOGGLE_READY' });

        if (hostStartBtn) {
            hostStartBtn.onclick = () => {
                hostStartBtn.disabled = true;
                hostStartBtn.setAttribute('data-loading', 'true');
                hostStartBtn.innerText = '⏳ 타일 섞는 중...';
                sendMessage({ type: 'START_GAME', room_id: currentRoomId });
            };
        }

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
                showToast("타일을 색상별로 정렬했습니다. (매 턴 유지됨)");
            };
        }

        if (btnSortNumber) {
            btnSortNumber.onclick = () => {
                currentSortMode = 'number';
                applyRackSort();
                renderRack();
                showToast("타일을 숫자별로 정렬했습니다. (매 턴 유지됨)");
            };
        }

        if (btnResetTurn) {
            btnResetTurn.onclick = () => {
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) return;
                localRack = JSON.parse(JSON.stringify(initialTurnRack));
                localTableSets = JSON.parse(JSON.stringify(initialTurnTableSets));
                selectedTiles = [];
                applyRackSort();
                renderRack();
                renderTable();
                showToast("이번 턴에 변경한 사항을 원래대로 돌렸습니다.");
            };
        }

        // ★ [통합] 단일 제출 / 패스 버튼 이벤트 ★
       if (btnSubmitTurn) {
            btnSubmitTurn.onclick = () => {
                if (String(myPlayerId) !== String(roomState?.current_turn_player_id)) {
                    showToast("내 턴일 때만 조작할 수 있습니다!");
                    return;
                }

                selectedTiles = [];
                localTableSets = localTableSets.filter(s => s && s.length > 0);

                // 유효하지 않은 세트가 테이블에 남아있는지 검증
                const invalidSet = localTableSets.find(s => !isValidRummikubSet(s));
                if (invalidSet) {
                    showToast("⚠️ 공유 테이블에 3장 미만이거나 올바르지 않은 세트 규칙이 존재합니다!");
                    renderTable();
                    return;
                }

                // 이번 턴 타일 제출 여부 판별
                const originalTableCount = (initialTurnTableSets || []).flat().length;
                const currentTableCount = localTableSets.flat().length;
                const isTilePlaced = currentTableCount > originalTableCount;

                // 첫 등록(Initial Meld) 검증
                const myPlayer = roomState.players.find(p => String(p.player_id) === String(myPlayerId));
                if (myPlayer && !myPlayer.has_opened && isTilePlaced) {
                    const ruleType = roomState.rule_type || 'official';
                    const validPlacedSets = localTableSets.filter(set => isValidRummikubSet(set));

                    if (ruleType === 'jaehee') {
                        // [재히룰] 단일 세트의 점수가 30을 '초과(> 30)'하는 세트가 1개 이상 필수
                        const hasSingleSetOver30 = validPlacedSets.some(set => calculateSetScore(set) >= 30);
                        if (!hasSingleSetOver30) {
                            showToast(`⚠️ [재히룰] 첫 등록은 단일 세트의 합이 30점 이상이어야 합니다!`);
                            return;
                        }
                    } else {
                        // [공식 룰] 제출 세트들의 점수 합산이 30점 이상(>= 30)
                        let totalScore = 0;
                        validPlacedSets.forEach(set => { totalScore += calculateSetScore(set); });
                        if (totalScore < 30) {
                            showToast(`⚠️ [공식룰] 첫 등록 점수 합계가 30점 이상이어야 합니다! (현재: ${totalScore}점)`);
                            return;
                        }
                    }
                }

                // 제출 완료 시 타이머 정지 및 버튼 중복 연타 방지
                clearInterval(timerInterval);
                btnSubmitTurn.disabled = true;
                btnSubmitTurn.classList.remove('highlight-submit');

                if (isTilePlaced) {
                    showToast("타일 배치를 완료하고 턴을 마칩니다.");
                } else {
                    showToast("타일 1장을 가져오고 턴을 넘깁니다.");
                }

                sendMessage({ type: 'SUBMIT_TURN', room_id: currentRoomId, table_sets: localTableSets, rack: localRack });

                // 1초 후 버튼 다시 활성화 (다음 턴 대기)
                setTimeout(() => { if (btnSubmitTurn) btnSubmitTurn.disabled = false; }, 1000);
            };
        }

        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const shareUrl = `${window.location.origin}/index.html?game=rummikub&room=${currentRoomId}`;
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
                const shareUrl = `${window.location.origin}/index.html?game=rummikub&room=${currentRoomId}`;
                const qrContainer = document.getElementById('qrcode');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    if (typeof QRCode === 'function') {
                        new QRCode(qrContainer, { text: shareUrl, width: 180, height: 180 });
                    } else {
                        qrContainer.innerText = shareUrl;
                    }
                }
                if (qrModal) qrModal.classList.add('active');
            };
        }

        if (qrModalClose && qrModal) {
            qrModalClose.onclick = () => qrModal.classList.remove('active');
        }
    }

    function initFormControls() {
        const createForm = document.getElementById('create-room-form');
        const joinForm = document.getElementById('join-room-form');

        const savedNick = localStorage.getItem('office_rummikub_last_nickname');
        if (savedNick) {
            const createNickEl = document.getElementById('create-nickname');
            const joinNickEl = document.getElementById('join-nickname');
            if (createNickEl) createNickEl.value = savedNick;
            if (joinNickEl) joinNickEl.value = savedNick;
        }

        if (createForm) {
            createForm.onsubmit = (e) => {
                e.preventDefault();
                const nickEl = document.getElementById('create-nickname');
                const nick = nickEl ? (nickEl.value.trim() || '루미마스터') : '루미마스터';
                saveMyNickname(nick);

                const selectedRule = document.querySelector('input[name="rule_type"]:checked')?.value || 'official';
                sendMessage({
                    type: 'CREATE_ROOM', 
                    game_type: 'RUMMIKUB',
                    title: document.getElementById('create-title') ? document.getElementById('create-title').value.trim() : '사내 실시간 루미큐브',
                    nickname: nick,
                    turn_time_limit: selectedTimeLimit,
                    rule_type: selectedRule
                });
            };
        }

        if (joinForm) {
            joinForm.onsubmit = (e) => {
                e.preventDefault();
                const nickEl = document.getElementById('join-nickname');
                const nick = nickEl ? (nickEl.value.trim() || '루미마스터') : '루미마스터';
                saveMyNickname(nick);

                sendMessage({
                    type: 'JOIN_ROOM', 
                    nickname: nick,
                    room_id: document.getElementById('join-room-code').value
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
                }
            };
        }
    }

    initStealthMode();
    initMobileSidebar();
    initNavControls();
    initGlobalClickDelegation();
    initFormControls();
    initGameControls();
    connectNetwork();
})();
