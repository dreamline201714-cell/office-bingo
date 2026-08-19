/* app_gostop.js - Fully Fixed & Refined GoStop Game Logic */

let ws = null;
let currentRoomId = null;
let myPlayerId = null;
let isHost = false;
let gameState = null;
let timerInterval = null;

let selectedStartChips = 10000;
let selectedPointChip = 100;
let selectedTurnTime = 15;
let currentSortMode = 'month';

let pendingPlayedCardId = null;
let currentCardTheme = localStorage.getItem('hwatu_card_theme') || 'notion';

function setCardTheme(themeName) {
    currentCardTheme = themeName;
    localStorage.setItem('hwatu_card_theme', themeName);

    document.querySelectorAll('.theme-select-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-card-theme') === themeName);
    });

    if (gameState) updateUI(gameState);
    showToast(themeName === 'classic' ? '🎴 레트로 화투패로 변경되었습니다.' : '🎨 노션 모던 화투패로 변경되었습니다.');
}

// 🎴 깃허브 실물 화투패 48장 1:1 명확 매핑 함수
function getClassicHwatuImgPath(card) {
    if (!card) return '';
    const baseUrl = "https://raw.githubusercontent.com/dreamline201714-cell/2026-02-15-hwatu-card-image-extraction/master/hwatu_cards";

    const month = card.month;
    const type = String(card.type || '').toUpperCase();
    const cardId = String(card.id || '').toLowerCase();
    
    let prefix = '';
    let suffix = '';

    // 1. 월별 접두사(Prefix) 매핑
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

    // 2. 종류별 접미사(Suffix) 매핑
    if (type === 'KWANG') {
        suffix = '광'; 
    } 
    else if (type === 'ANIMAL') {
        suffix = '열끗';
    } 
    else if (type === 'RIBBON') {
        if (month === 7) suffix = '홍단'; 
        else if (month === 12) suffix = '초단'; // 12월 비 띠가 '초단'으로 저장됨
        else if (month === 1 || month === 2 || month === 3) suffix = '홍단';
        else if (month === 6 || month === 9 || month === 10) suffix = '청단';
        else suffix = '초단';
    } 
    else if (type === 'DOUBLE_PI') {
        if (month === 9) suffix = '피2';       
        else if (month === 11) suffix = '쌍피'; 
        else if (month === 12) suffix = '피';   // 12월 비 쌍피가 '피'로 저장됨
        else suffix = '쌍피';
    } 
    else {
        // 일반 피 (1, 2 구분)
        if (cardId.includes('2') || cardId.includes('b')) {
            suffix = '피2';
        } else {
            suffix = '피1';
        }
    }

    const fileName = encodeURIComponent(`${prefix}_${suffix}.png`);
    return `${baseUrl}/${fileName}`;
}

const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        switchTab('join');
        const codeInput = document.getElementById('room-code-input');
        if (codeInput) codeInput.value = roomParam.toUpperCase();
    }
});

function connectWS(callback) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (callback) callback();
        return;
    }
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { 
        document.getElementById('status-dot').className = 'status-dot connected';
        document.getElementById('status-text').innerText = '연결됨';
        if (callback) callback(); 
    };
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => {
        document.getElementById('status-dot').className = 'status-dot';
        document.getElementById('status-text').innerText = '재연결 중...';
        setTimeout(() => connectWS(), 2000);
    };
}

function switchTab(tab) {
    const createTab = document.getElementById('create-tab');
    const joinTab = document.getElementById('join-tab');
    if (createTab) createTab.style.display = tab === 'create' ? 'block' : 'none';
    if (joinTab) joinTab.style.display = tab === 'join' ? 'block' : 'none';
    
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', (tab === 'create' && i === 0) || (tab === 'join' && i === 1));
    });
}

function setSortMode(mode) {
    currentSortMode = mode;
    const monthBtn = document.getElementById('sort-month-btn');
    const typeBtn = document.getElementById('sort-type-btn');
    if (monthBtn) monthBtn.classList.toggle('active', mode === 'month');
    if (typeBtn) typeBtn.classList.toggle('active', mode === 'type');
    if (gameState) updateUI(gameState);
}

function sortHandCards(handList) {
    if (!handList) return [];
    const sorted = [...handList];
    if (currentSortMode === 'month') {
        sorted.sort((a, b) => a.month - b.month);
    } else if (currentSortMode === 'type') {
        const typeOrder = { 'KWANG': 1, 'ANIMAL': 2, 'RIBBON': 3, 'DOUBLE_PI': 4, 'PI': 5 };
        sorted.sort((a, b) => {
            const orderA = typeOrder[a.type] || 6;
            const orderB = typeOrder[b.type] || 6;
            if (orderA !== orderB) return orderA - orderB;
            return a.month - b.month;
        });
    }
    return sorted;
}

function selectChip(btn, amount) {
    document.querySelectorAll('.config-size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedStartChips = amount;
}

function selectPointChip(btn, amount) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedPointChip = amount;
}

function selectTurnTime(btn, seconds) {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTurnTime = seconds;
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

function showToast(msg) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.innerText = msg;
    container.appendChild(item);
    setTimeout(() => item.remove(), 2500);
}

function triggerSpecialFX(text, fxClass) {
    const badge = document.getElementById('special-fx-badge');
    if (!badge) return;

    badge.innerText = text;
    badge.className = `special-fx-badge active ${fxClass}`;

    setTimeout(() => {
        badge.classList.remove('active');
    }, 1800);
}

function animatePiSteal(victimPlayerId) {
    let sourceEl = null;
    if (victimPlayerId) {
        sourceEl = document.getElementById(`captured-${victimPlayerId}-PI`);
    }
    if (!sourceEl) {
        sourceEl = document.querySelector('.captured-group-cards-stack') || document.querySelector('#opponents-container .captured-mat-box');
    }
    const targetEl = document.getElementById('my-captured-pi');

    if (!sourceEl || !targetEl) return;

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const flyCard = document.createElement('div');
    flyCard.className = 'flying-pi-card';
    flyCard.innerText = '🍃 피';
    flyCard.style.left = `${sourceRect.left + sourceRect.width / 2 - 21}px`;
    flyCard.style.top = `${sourceRect.top + sourceRect.height / 2 - 33}px`;

    document.body.appendChild(flyCard);

    requestAnimationFrame(() => {
        flyCard.style.left = `${targetRect.left + targetRect.width / 2 - 21}px`;
        flyCard.style.top = `${targetRect.top + targetRect.height / 2 - 33}px`;
        flyCard.style.transform = 'rotate(360deg) scale(1.05)';
    });

    setTimeout(() => {
        flyCard.remove();
        if (targetEl.parentElement) {
            targetEl.parentElement.classList.add('pi-land-pulse');
            setTimeout(() => targetEl.parentElement.classList.remove('pi-land-pulse'), 300);
        }
    }, 650);
}

function createRoom() {
    const nickInput = document.getElementById('nickname-input');
    const nickname = nickInput ? (nickInput.value.trim() || '타짜') : '타짜';
    
    connectWS(() => {
        ws.send(JSON.stringify({ 
            type: 'CREATE_ROOM', 
            game_type: 'GOSTOP', 
            nickname: nickname, 
            start_chips: selectedStartChips, 
            point_chip: selectedPointChip,
            turn_time_limit: selectedTurnTime,
            title: '실시간 고스톱 대국' 
        }));
    });
}

function joinRoom() {
    const nickInput = document.getElementById('join-nickname-input') || document.getElementById('nickname-input');
    const codeInput = document.getElementById('room-code-input');
    const nickname = nickInput ? (nickInput.value.trim() || '타짜') : '타짜';
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    
    if (!code) return showToast('방 코드를 입력해주세요.');
    connectWS(() => {
        ws.send(JSON.stringify({ type: 'JOIN_ROOM', room_id: code, nickname: nickname }));
    });
}

function toggleReady() {
    if (ws && currentRoomId) ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
}

function startGame() {
    if (ws && currentRoomId) {
        ws.send(JSON.stringify({ type: 'PREPARE_GAME' }));
    }
}

function makeGoStopDecision(decision) {
    const decisionModal = document.getElementById('gostop-decision-modal');
    if (decisionModal) decisionModal.style.display = 'none';
    if (ws && currentRoomId) {
        ws.send(JSON.stringify({ type: 'GOSTOP_DECISION', decision: decision }));
    }
}

function playCard(cardId, isBomb = false) {
    if (!gameState || gameState.status !== 'PLAYING') return;
    if (gameState.current_turn_player_id !== myPlayerId) return showToast('당신의 턴이 아닙니다!');
    if (gameState.turn_phase !== 'PLAY_HAND') return;

    const myHand = gameState.players.find(p => p.player_id === myPlayerId).hand;
    const playedCard = myHand.find(c => c.id === cardId);
    if (!playedCard) return;

    if (isBomb) {
        triggerSpecialFX('💣 폭탄!', 'fx-badge-bomb');
        const bombCards = myHand.filter(c => c.month === playedCard.month);
        const cardIds = bombCards.map(c => c.id);
        ws.send(JSON.stringify({ type: 'PLAY_BOMB_CARDS', card_ids: cardIds, month: playedCard.month }));
        return;
    }

    pendingPlayedCardId = cardId;
    
    const handCards = document.querySelectorAll('#my-hand .hwatu-card');
    handCards.forEach(el => {
        if (el.getAttribute('data-card-id') === cardId) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });

    highlightTableMatches(playedCard.month);
}

function onTableCardClick(targetCard) {
    if (!gameState || gameState.status !== 'PLAYING' || gameState.current_turn_player_id !== myPlayerId) return;

    if (gameState.turn_phase === 'PLAY_HAND' && pendingPlayedCardId) {
        ws.send(JSON.stringify({ type: 'PLAY_HAND_CARD', card_id: pendingPlayedCardId, target_card_id: targetCard ? targetCard.id : null }));
        pendingPlayedCardId = null;
        return;
    }

    if (gameState.turn_phase === 'DRAW_DECK_CHOICE' && targetCard) {
        ws.send(JSON.stringify({ type: 'CONFIRM_DECK_DRAW', target_card_id: targetCard.id }));
    }
}

function onDeckClick() {
    if (!gameState || gameState.status !== 'PLAYING') return;
    if (gameState.current_turn_player_id !== myPlayerId) return showToast('당신의 턴이 아닙니다!');
    if (gameState.turn_phase !== 'DRAW_DECK') return showToast('먼저 손패를 선택하고 바닥을 눌러 내주세요!');

    ws.send(JSON.stringify({ type: 'DRAW_DECK_CARD' }));
}

function onTableEmptyClick() {
    if (!gameState || gameState.status !== 'PLAYING' || gameState.current_turn_player_id !== myPlayerId) return;

    if (gameState.turn_phase === 'PLAY_HAND' && pendingPlayedCardId) {
        ws.send(JSON.stringify({ type: 'PLAY_HAND_CARD', card_id: pendingPlayedCardId, target_card_id: null }));
        pendingPlayedCardId = null;
        return;
    }

    if (gameState.turn_phase === 'DRAW_DECK_NO_MATCH') {
        ws.send(JSON.stringify({ type: 'CONFIRM_DECK_DRAW', target_card_id: null }));
    }
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input ? input.value.trim() : '';
    if (text && ws) {
        ws.send(JSON.stringify({ type: 'CHAT_MESSAGE', message: text }));
        input.value = '';
    }
}

function openHelpModal() { 
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.add('active'); 
}

function openQRModal() {
    if (!currentRoomId) return;
    const roomUrl = `${window.location.origin}/index.html?game=gostop&room=${currentRoomId}`;
    const qrImg = document.getElementById('qr-image');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(roomUrl)}`;
    const modal = document.getElementById('qr-modal');
    if (modal) modal.classList.add('active');
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active'); 
}

function copyRoomLink() {
    if (!currentRoomId) return;
    const roomUrl = `${window.location.origin}/index.html?game=gostop&room=${currentRoomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => showToast('초대 링크가 복사되었습니다!'));
}

function renderHwatuCard(card, onClick, isSelectable = false, isBombable = false, isHandMatched = false) {
    if (!card) return '';
    const cardEl = document.createElement('div');
    const typeClass = card.type ? card.type.toLowerCase().replace('_', '-') : 'pi';
    
    cardEl.className = `hwatu-card theme-${currentCardTheme} ${typeClass} ${isSelectable ? 'selectable' : ''} ${isHandMatched ? 'match-hint' : ''}`;
    
    cardEl.setAttribute('data-card-id', card.id);
    cardEl.setAttribute('data-card-month', card.month);

    let bombBtnHtml = '';
    if (isBombable) {
        bombBtnHtml = `<button class="bomb-badge-btn" onclick="event.stopPropagation(); playCard('${card.id}', true)">💣 폭탄</button>`;
    }

    if (currentCardTheme === 'classic') {
        const imgPath = getClassicHwatuImgPath(card);
        cardEl.innerHTML = `
            <img src="${imgPath}" alt="${card.name || '화투'}" class="card-img" onerror="this.onerror=null; this.parentElement.classList.remove('theme-classic'); this.parentElement.classList.add('theme-notion'); this.parentElement.innerHTML='<div class=\\'card-top\\'><span class=\\'card-month\\'>${card.month || 0}월</span></div><div class=\\'card-icon\\'>🍃</div>';">
            ${bombBtnHtml}
        `;
    } else {
        const badgeText = { 'KWANG': '광', 'ANIMAL': '십', 'RIBBON': card.ribbon_type || '띠', 'PI': '피', 'DOUBLE_PI': '쌍피' }[card.type] || '피';
        const iconText = { 'KWANG': '☀', 'ANIMAL': '🦅', 'RIBBON': '🎗', 'PI': '🍃', 'DOUBLE_PI': '💎' }[card.type] || '🍃';

        cardEl.innerHTML = `
            <div class="card-top">
                <span class="card-month">${card.month || 0}월</span>
                <span class="card-badge">${badgeText}</span>
            </div>
            <div class="card-icon">${iconText}</div>
            <div class="card-name-sub">${card.name || ''}</div>
            ${bombBtnHtml}
        `;
    }

    if (onClick) cardEl.onclick = (e) => { e.stopPropagation(); onClick(card); };
    return cardEl;
}

function highlightTableMatches(targetMonth) {
    const tableCards = document.querySelectorAll('.board-mat-center .hwatu-card');
    tableCards.forEach(el => {
        const cardMonth = parseInt(el.getAttribute('data-card-month'), 10);
        if (cardMonth === targetMonth) {
            el.classList.add('selectable');
        } else {
            el.classList.remove('selectable');
        }
    });
}

function startTimer(seconds) {
    clearInterval(timerInterval);
    let remaining = seconds;
    const timerText = document.getElementById('turn-timer');
    const timerFill = document.getElementById('turn-timer-fill');

    timerInterval = setInterval(() => {
        remaining--;
        if (remaining < 0) {
            clearInterval(timerInterval);
            return;
        }
        if (timerText) timerText.innerText = `${remaining}초`;
        if (timerFill) timerFill.style.width = `${(remaining / seconds) * 100}%`;
    }, 1000);
}

function handleMessage(msg) {
    if (msg.type === 'ROOM_JOINED') {
        currentRoomId = msg.room_id;
        myPlayerId = msg.player_id;
        isHost = msg.is_host;
        document.getElementById('lobby-card').style.display = 'none';
        document.getElementById('arena').style.display = 'grid';
        document.getElementById('room-code-display').innerText = currentRoomId;
    }

    if (msg.type === 'ROOM_UPDATED' || msg.type === 'ROOM_JOINED') {
        if (msg.state) updateUI(msg.state);
    }

    if (msg.type === 'CHAT_MESSAGE') appendChat(msg.chat);
}

function updateUI(state) {
    gameState = state;
    const myInfo = state.players.find(p => p.player_id === myPlayerId);
    const opponents = state.players.filter(p => p.player_id !== myPlayerId);

    if (myInfo) isHost = myInfo.is_host;

    const hostControls = document.getElementById('host-controls');
    const hintEl = document.getElementById('game-status-hint');
    const decisionModal = document.getElementById('gostop-decision-modal');

    if (state.status === 'SHUFFLING') {
        if (hostControls) hostControls.style.display = 'none';
        if (decisionModal) decisionModal.style.display = 'none';
        if (hintEl) hintEl.innerText = '🎴 패 섞는 중... (대국 준비 중)';
        document.getElementById('turn-player-name').innerText = '-';
        return;
    }

    if (state.status === 'WAITING') {
        if (hostControls) hostControls.style.display = 'flex';
        if (decisionModal) decisionModal.style.display = 'none';
        if (hintEl) hintEl.innerText = '';
        document.getElementById('turn-player-name').innerText = '-';

        const readyBtn = document.getElementById('ready-btn');
        const startBtn = document.getElementById('start-btn');
        if (myInfo && readyBtn) {
            readyBtn.innerText = myInfo.is_ready ? '준비 취소' : '준비 완료';
            readyBtn.className = myInfo.is_ready ? 'btn-ready cancel' : 'btn-ready';
        }
        
        if (isHost && startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.innerText = '게임 시작';
            const activePlayers = state.players.filter(p => !p.is_spectator);
            const guestsReady = activePlayers.filter(p => !p.is_host).every(p => p.is_ready);
            startBtn.disabled = !(activePlayers.length >= 2 && guestsReady);
        } else if (startBtn) {
            startBtn.style.display = 'none';
        }
    } else {
        if (hostControls) hostControls.style.display = 'none';
    }

    const isMyTurn = (state.current_turn_player_id === myPlayerId);
    const turnPlayer = state.players.find(p => p.player_id === state.current_turn_player_id);
    document.getElementById('turn-player-name').innerText = turnPlayer ? turnPlayer.nickname : '-';

    if (state.status === 'PLAYING' && isMyTurn && state.turn_phase === 'DECIDE_GO_STOP' && myInfo && myInfo.score >= 3) {
        document.getElementById('modal-score-text').innerText = `${myInfo.score}`;
        if (decisionModal) decisionModal.style.display = 'flex';
    } else {
        if (decisionModal) decisionModal.style.display = 'none';
    }

    if (state.status === 'PLAYING') {
        startTimer(state.turn_time_remaining || 15);
        if (isMyTurn && hintEl) {
            if (state.turn_phase === 'DECIDE_GO_STOP') {
                hintEl.innerText = '🎴 GO를 하시겠습니까, STOP을 하시겠습니까?';
            } else if (pendingPlayedCardId) {
                hintEl.innerText = '🎯 가져올 바닥 패를 클릭하세요!';
            } else if (state.turn_phase === 'PLAY_HAND') {
                hintEl.innerText = '👈 내 손패에서 낼 카드를 선택하세요';
            } else if (state.turn_phase === 'DRAW_DECK') {
                hintEl.innerText = '👉 남은 덱을 클릭하여 카드를 오픈하세요!';
            } else if (state.turn_phase === 'DRAW_DECK_CHOICE') {
                hintEl.innerText = '🎯 오픈된 패와 먹을 바닥 패를 선택하세요!';
            } else if (state.turn_phase === 'DRAW_DECK_NO_MATCH') {
                hintEl.innerText = '📥 바닥을 클릭하여 오픈된 패를 내려놓으세요!';
            }
        } else if (hintEl) {
            hintEl.innerText = '상대방이 진행 중입니다...';
        }
    }

    const deckStack = document.getElementById('deck-stack');
    const deckArrow = document.getElementById('deck-arrow');
    const drawnWrapper = document.getElementById('drawn-card-wrapper');
    const drawnDisplay = document.getElementById('drawn-card-display');
    if (drawnDisplay) drawnDisplay.innerHTML = '';

    if (state.drawn_card) {
        if (drawnDisplay) drawnDisplay.appendChild(renderHwatuCard(state.drawn_card));
        if (deckArrow) deckArrow.style.display = 'inline-block';
        if (drawnWrapper) drawnWrapper.style.display = 'flex';
    } else {
        if (deckArrow) deckArrow.style.display = 'none';
        if (drawnWrapper) drawnWrapper.style.display = 'none';
    }

    if (deckStack) {
        if (isMyTurn && state.turn_phase === 'DRAW_DECK') deckStack.classList.add('draw-ready');
        else deckStack.classList.remove('draw-ready');
    }

    const deckCountEl = document.getElementById('deck-count-num');
    if (deckCountEl) deckCountEl.innerText = state.deck_count || 0;

    const slotTop = document.getElementById('table-slot-top');
    const slotBottom = document.getElementById('table-slot-bottom');
    const slotLeft = document.getElementById('table-slot-left');
    const slotRight = document.getElementById('table-slot-right');

    if (slotTop) slotTop.innerHTML = ''; 
    if (slotBottom) slotBottom.innerHTML = '';
    if (slotLeft) slotLeft.innerHTML = ''; 
    if (slotRight) slotRight.innerHTML = '';

    const myMonths = new Set((isMyTurn && myInfo && myInfo.hand) ? myInfo.hand.map(c => c.month) : []);

    if (state.table_cards) {
        const slots = [slotTop, slotRight, slotBottom, slotLeft].filter(Boolean);
        state.table_cards.forEach((card, idx) => {
            const isSelectableMatch = isMyTurn && state.drawn_card && (card.month === state.drawn_card.month);
            const isHandMatched = isMyTurn && state.turn_phase === 'PLAY_HAND' && myMonths.has(card.month);

            const cardEl = renderHwatuCard(card, (c) => onTableCardClick(c), isSelectableMatch, false, isHandMatched);
            if (slots[idx % slots.length]) slots[idx % slots.length].appendChild(cardEl);
        });
    }

    const oppContainer = document.getElementById('opponents-container');
    if (oppContainer) {
        oppContainer.innerHTML = '';
        opponents.forEach(opp => {
            const box = document.createElement('div');
            box.className = 'player-box';
            box.innerHTML = `
                <div class="player-header">
                    <span>${opp.nickname} ${opp.is_spectator ? '<small>(관전)</small>' : ''}</span>
                    <div>
                        <span class="chip-badge">${(opp.chips || 0).toLocaleString()} 칩</span>
                        <span style="margin-left:6px; color:#e53935; font-weight:bold;">${opp.score || 0}점</span>
                    </div>
                </div>
                <div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:3px; display:flex; justify-content:space-between;">
                    <span>📥 획득한 패</span>
                    <small style="color:var(--border-accent); cursor:pointer;" onclick="openCapturedDetailModal('${opp.player_id}')">🔍 크게보기</small>
                </div>
                <div id="captured-${opp.player_id}" class="captured-mat-box" onclick="openCapturedDetailModal('${opp.player_id}')"></div>
            `;
            oppContainer.appendChild(box);
            renderCategorizedCapturedStacked(`captured-${opp.player_id}`, opp.captured || [], opp.player_id);
        });
    }

    const tableMonths = new Set((isMyTurn && state.table_cards) ? state.table_cards.map(c => c.month) : []);

    const myHandEl = document.getElementById('my-hand');
    if (myHandEl) {
        myHandEl.innerHTML = '';
        if (myInfo && myInfo.hand) {
            const sortedHand = sortHandCards(myInfo.hand);
            sortedHand.forEach(card => {
                const handSameMonthCnt = myInfo.hand.filter(c => c.month === card.month).length;
                const tableSameMonthCnt = (state.table_cards || []).filter(c => c.month === card.month).length;
                const isBombable = isMyTurn && state.turn_phase === 'PLAY_HAND' && (handSameMonthCnt === 3 && tableSameMonthCnt === 1);
                const isMatchedWithTable = isMyTurn && state.turn_phase === 'PLAY_HAND' && tableMonths.has(card.month);
                
                const isSelected = (pendingPlayedCardId === card.id);

                const cardNode = renderHwatuCard(card, (c) => playCard(c.id), false, isBombable, isMatchedWithTable);
                if (isSelected) {
                    cardNode.classList.add('selected');
                }
                myHandEl.appendChild(cardNode);
            });
        }
    }

    if (myInfo) {
        const myNameEl = document.getElementById('my-name');
        const myChipsEl = document.getElementById('my-chips');
        const myScoreEl = document.getElementById('my-score');
        if (myNameEl) myNameEl.innerText = myInfo.nickname;
        if (myChipsEl) myChipsEl.innerText = `${(myInfo.chips || 0).toLocaleString()} 칩`;
        if (myScoreEl) myScoreEl.innerText = `${myInfo.score || 0}점`;
        renderMyCategorizedCapturedStacked(myInfo.captured || []);
    }

    const mobileCountSpan = document.getElementById('mobile-player-count');
	if (mobileCountSpan && state.players) {
		mobileCountSpan.innerText = state.players.length;
	}
	const playerListEl = document.getElementById('player-list');
    if (playerListEl) {
        playerListEl.innerHTML = '';
        state.players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-card';
            item.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="color:${p.color};">${p.nickname[0]}</div>
                    <div style="display:flex; flex-direction:column;">
                        <span class="player-name">${p.nickname}</span>
                        <small style="color:#f59e0b; font-weight:bold; font-size:0.7rem;">${(p.chips || 0).toLocaleString()} 칩</small>
                    </div>
                </div>
                <span class="ready-tag ${p.is_ready ? 'ready' : 'waiting'}">${p.is_ready ? '준비완료' : '대기중'}</span>
            `;
            playerListEl.appendChild(item);
        });
    }

    // 흔들기 및 국진 변환 UI 전용 오버레이
    if (myInfo && isMyTurn && state.status === 'PLAYING') {
        renderShakeButtonUI(myInfo);
        renderKukjinMoveUI(myInfo);
    }
}

function renderMyCategorizedCapturedStacked(capturedList) {
    const kwangEl = document.getElementById('my-captured-kwang');
    const animalEl = document.getElementById('my-captured-animal');
    const ribbonEl = document.getElementById('my-captured-ribbon');
    const piEl = document.getElementById('my-captured-pi');

    if (kwangEl) kwangEl.innerHTML = ''; 
    if (animalEl) animalEl.innerHTML = '';
    if (ribbonEl) ribbonEl.innerHTML = ''; 
    if (piEl) piEl.innerHTML = '';

    const kwangs = capturedList.filter(c => c.type === 'KWANG');
    const animals = capturedList.filter(c => c.type === 'ANIMAL');
    const ribbons = capturedList.filter(c => c.type === 'RIBBON');
    const pis = capturedList.filter(c => c.type === 'PI' || c.type === 'DOUBLE_PI');

    if (kwangEl) appendStackedCards(kwangEl, kwangs);
    if (animalEl) appendStackedCards(animalEl, animals);
    if (ribbonEl) appendStackedCards(ribbonEl, ribbons);
    if (piEl) appendStackedCards(piEl, pis);

    const kwangCntEl = document.getElementById('my-kwang-count');
    const animalCntEl = document.getElementById('my-animal-count');
    const ribbonCntEl = document.getElementById('my-ribbon-count');
    const piCntEl = document.getElementById('my-pi-count');

    if (kwangCntEl) kwangCntEl.innerText = kwangs.length;
    if (animalCntEl) animalCntEl.innerText = animals.length;
    if (ribbonCntEl) ribbonCntEl.innerText = ribbons.length;
    
    let piTotal = 0;
    pis.forEach(c => piTotal += (c.type === 'DOUBLE_PI' ? 2 : 1));
    if (piCntEl) piCntEl.innerText = piTotal;
}

function renderCategorizedCapturedStacked(containerId, capturedList, playerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const types = ['KWANG', 'ANIMAL', 'RIBBON', 'PI'];
    const titles = {'KWANG':'☀ 광', 'ANIMAL':'🦅 열끗', 'RIBBON':'🎗 띠', 'PI':'🍃 피'};

    types.forEach(t => {
        const groupCards = capturedList.filter(c => t === 'PI' ? (c.type === 'PI' || c.type === 'DOUBLE_PI') : c.type === t);
        const grp = document.createElement('div');
        grp.className = 'captured-group';
        grp.innerHTML = `<div class="captured-group-title">${titles[t]} <span>${groupCards.length}</span></div>`;
        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'captured-group-cards-stack';
        
        if (t === 'PI' && playerId) {
            cardsDiv.id = `captured-${playerId}-PI`;
        }
        
        appendStackedCards(cardsDiv, groupCards);
        grp.appendChild(cardsDiv);
        container.appendChild(grp);
    });
}

function appendStackedCards(containerEl, cards) {
    cards.forEach((card, idx) => {
        const cardNode = renderHwatuCard(card);
        cardNode.style.left = `${idx * 18}px`;
        cardNode.style.zIndex = idx + 1;
        containerEl.appendChild(cardNode);
    });
}

function openCapturedDetailModal(targetPlayerId) {
    if (!gameState) return;
    let player = null;
    if (targetPlayerId === 'my') {
        player = gameState.players.find(p => p.player_id === myPlayerId);
    } else {
        player = gameState.players.find(p => p.player_id === targetPlayerId);
    }

    if (!player) return;

    const modalTitle = document.getElementById('captured-modal-title');
    if (modalTitle) modalTitle.innerText = `📥 [${player.nickname}]님의 획득한 패 (총 ${player.captured ? player.captured.length : 0}장 / ${player.score || 0}점)`;
    
    const modalContent = document.getElementById('captured-modal-content');
    if (!modalContent) return;
    modalContent.innerHTML = '';

    const types = ['KWANG', 'ANIMAL', 'RIBBON', 'PI'];
    const titles = {'KWANG':'☀ 광', 'ANIMAL':'🦅 열끗', 'RIBBON':'🎗 띠', 'PI':'🍃 피'};

    types.forEach(t => {
        const groupCards = (player.captured || []).filter(c => t === 'PI' ? (c.type === 'PI' || c.type === 'DOUBLE_PI') : c.type === t);
        if (groupCards.length > 0) {
            const section = document.createElement('div');
            section.style.marginBottom = '12px';
            section.innerHTML = `<h4 style="margin-bottom:6px; color:var(--text-secondary); border-bottom:1px solid #eee; padding-bottom:3px;">${titles[t]} (${groupCards.length}장)</h4>`;
            const grid = document.createElement('div');
            grid.className = 'modal-cards-grid';
            groupCards.forEach(c => grid.appendChild(renderHwatuCard(c)));
            section.appendChild(grid);
            modalContent.appendChild(section);
        }
    });

    const modal = document.getElementById('captured-detail-modal');
    if (modal) modal.classList.add('active');
}

function appendChat(chat) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
	// 인원수 관련 시스템 메시지 감지 시 상단 숫자 보정
    if (chat.system && gameState && gameState.players) {
        const mobileCountSpan = document.getElementById('mobile-player-count');
        if (mobileCountSpan) mobileCountSpan.innerText = gameState.players.length;
    }
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '4px';
    
    if (chat.system) {
        msgDiv.style.color = 'var(--text-muted)';
        msgDiv.innerText = `[시스템] ${chat.text}`;

        const txt = chat.text;
        if (txt.includes('폭탄')) triggerSpecialFX('💣 폭탄!', 'fx-badge-bomb');
        else if (txt.includes('따닥')) triggerSpecialFX('⚡ 따닥!', 'fx-badge-ttadak');
        else if (txt.includes('쪽')) triggerSpecialFX('✨ 쪽!', 'fx-badge-chok');
        else if (txt.includes('쓸') || txt.includes('싹쓸이')) triggerSpecialFX('🧹 쓸!', 'fx-badge-sweep');
        
        if (txt.includes('상대 피') || txt.includes('뺏어옵니다') || txt.includes('뺏어왔습니다') || txt.includes('쓸어왔습니다')) {
            animatePiSteal();
            showToast('⚡ 상대 피 1장을 뺏어왔습니다!');
        }
    } else {
        msgDiv.innerText = `${chat.nickname}: ${chat.text}`;
    }
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// 흔들기 UI 렌더링
function renderShakeButtonUI(myInfo) {
    if (!myInfo || !myInfo.hand) return;
    
    const counts = {};
    myInfo.hand.forEach(c => { counts[c.month] = (counts[c.month] || 0) + 1; });
    const shakeableMonths = Object.keys(counts).filter(m => counts[m] === 3);
    
    let shakeBox = document.getElementById('shake-btn-box');
    const handHeader = document.querySelector('.hand-tray-header');
    
    if (!shakeBox && handHeader) {
        shakeBox = document.createElement('div');
        shakeBox.id = 'shake-btn-box';
        handHeader.appendChild(shakeBox);
    }
    
    if (shakeBox) {
        shakeBox.innerHTML = '';
        if (shakeableMonths.length > 0 && gameState.turn_phase === 'PLAY_HAND') {
            shakeableMonths.forEach(m => {
                const isAlreadyShook = (myInfo.shook_count > 0);
                const btn = document.createElement('button');
                btn.className = 'sort-btn active';
                
                if (isAlreadyShook) {
                    btn.style.color = '#10b981';
                    btn.style.borderColor = '#10b981';
                    btn.innerText = `✅ ${m}월 흔듦 (2배)`;
                    btn.disabled = true;
                } else {
                    btn.style.color = '#e53935';
                    btn.style.borderColor = '#e53935';
                    btn.innerText = `👋 ${m}월 흔들기`;
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (ws) {
                            ws.send(JSON.stringify({ 
                                type: 'SHAKE_HAND', 
                                room_id: currentRoomId, 
                                month: parseInt(m, 10) 
                            }));
                            showToast(`👋 ${m}월 패를 흔들었습니다! (승리 시 2배)`);
                        }
                    };
                }
                shakeBox.appendChild(btn);
            });
        }
    }
}

// 국진 ➔ 쌍피 변환 버튼 렌더링
function renderKukjinMoveUI(myInfo) {
    if (!myInfo || !myInfo.captured) return;
    
    const hasKukjinAnimal = myInfo.captured.some(c => c.month === 9 && c.type === 'ANIMAL');
    const piGroupTitle = document.getElementById('my-captured-pi');
    
    let moveBtn = document.getElementById('btn-move-kukjin');
    if (hasKukjinAnimal && piGroupTitle) {
        if (!moveBtn) {
            moveBtn = document.createElement('button');
            moveBtn.id = 'btn-move-kukjin';
            moveBtn.className = 'bomb-badge-btn';
            moveBtn.style.marginTop = '4px';
            moveBtn.innerText = '🔄 국진 ➔ 쌍피 이동';
            moveBtn.onclick = (e) => {
                e.stopPropagation();
                if (ws) ws.send(JSON.stringify({ type: 'MOVE_KUKJIN_TO_PI' }));
            };
            piGroupTitle.parentElement.appendChild(moveBtn);
        }
    } else if (moveBtn) {
        moveBtn.remove();
    }
}

/* ==========================================
   📱 모바일 헤더 💬 버튼 클릭 시 사이드바 서랍 열기/닫기
   ========================================== */
window.addEventListener('DOMContentLoaded', () => {
    const mobileFabBtn = document.getElementById('mobile-fab-btn');
    const mobileSidebar = document.getElementById('mobile-sidebar');
    const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

    if (mobileFabBtn && mobileSidebar) {
        mobileFabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileSidebar.classList.add('active'); // 모바일 서랍 열기
        });
    }

    if (mobileSidebarClose && mobileSidebar) {
        mobileSidebarClose.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileSidebar.classList.remove('active'); // 모바일 서랍 닫기
        });
    }
});