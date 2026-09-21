/**
 * common_fx.js - Office Live Games Hub Modern FX Engine
 * 
 * 1. Web Audio Procedural Sound Engine (Pop, Slam, Chip, Laser, Win, Tick)
 * 2. Floating Emoji Reactions System
 * 3. Quick Chat Speech Bubbles
 * 4. Screen Shake & Haptic Visual Feedback
 * 5. Neon Laser & Cut-in Banner Effects
 */

(function () {
    // -------------------------------------------------------------
    // 1. Web Audio Procedural Synthesizer
    // -------------------------------------------------------------
    class WebAudioSynth {
        constructor() {
            this.ctx = null;
            this.isMuted = false;
            this.initOnUserGesture();
        }

        initOnUserGesture() {
            const unlock = () => {
                if (!this.ctx) {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (AudioCtx) this.ctx = new AudioCtx();
                }
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                window.removeEventListener('click', unlock);
                window.removeEventListener('keydown', unlock);
                window.removeEventListener('touchstart', unlock);
            };
            window.addEventListener('click', unlock, { once: true });
            window.addEventListener('keydown', unlock, { once: true });
            window.addEventListener('touchstart', unlock, { once: true });
        }

        setMuted(muted) {
            this.isMuted = !!muted;
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            return this.isMuted;
        }

        // 경쾌한 플라스틱/나무 타일 클릭음 (Pop)
        playPop(freq = 600, duration = 0.08) {
            if (this.isMuted || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + duration * 0.4);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);

                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(now);
                osc.stop(now + duration);
            } catch (e) { }
        }

        // 화투패 내리치기 / 슬램음 (Slam)
        playSlam() {
            if (this.isMuted || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                
                // 1) 묵직한 쿵 소리
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.15);

                // 2) 착 달라붙는 고주파 클릭음
                const snap = this.ctx.createOscillator();
                const snapGain = this.ctx.createGain();
                snap.type = 'triangle';
                snap.frequency.setValueAtTime(900, now);
                snap.frequency.exponentialRampToValueAtTime(150, now + 0.06);

                snapGain.gain.setValueAtTime(0.3, now);
                snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

                snap.connect(snapGain);
                snapGain.connect(this.ctx.destination);
                snap.start(now);
                snap.stop(now + 0.06);
            } catch (e) { }
        }

        // 칩 짤랑거리는 소리 (Chip)
        playChip() {
            if (this.isMuted || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const freqs = [1800, 2400, 3100];
                freqs.forEach((f, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    const delay = idx * 0.02;

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(f, now + delay);
                    gain.gain.setValueAtTime(0.12, now + delay);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now + delay);
                    osc.stop(now + delay + 0.08);
                });
            } catch (e) { }
        }

        // 레이저 라인 효과음 (Laser / Bingo)
        playLaser() {
            if (this.isMuted || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);

                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.25);
            } catch (e) { }
        }

        // 시간 촉박 카운트다운 틱톡음 (Tick)
        playTick() {
            if (this.isMuted || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.04);
            } catch (e) { }
        }

        // 승리 팡파레 멜로디 (Win Fanfare)
        playWin() {
            if (this.isMuted || !this.ctx) return;
            try {
                const notes = [
                    { f: 523.25, d: 0.12 }, // C5
                    { f: 659.25, d: 0.12 }, // E5
                    { f: 783.99, d: 0.14 }, // G5
                    { f: 1046.5, d: 0.45 }  // C6
                ];
                let cur = this.ctx.currentTime;
                notes.forEach(n => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(n.f, cur);

                    gain.gain.setValueAtTime(0.25, cur);
                    gain.gain.exponentialRampToValueAtTime(0.001, cur + n.d);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(cur);
                    osc.stop(cur + n.d);
                    cur += n.d * 0.85;
                });
            } catch (e) { }
        }
    }

    // -------------------------------------------------------------
    // 2. Screen Shake & Haptic Feedback
    // -------------------------------------------------------------
    function triggerScreenShake(intensity = 5, duration = 300) {
        const body = document.body;
        if (!body) return;
        body.classList.add('shake-active');
        setTimeout(() => {
            body.classList.remove('shake-active');
        }, duration);
    }

    // -------------------------------------------------------------
    // 3. Floating Reaction Engine
    // -------------------------------------------------------------
    class FloatingReactionEngine {
        constructor() {
            this.container = null;
            this.ensureContainer();
        }

        ensureContainer() {
            if (document.getElementById('floating-reaction-container')) {
                this.container = document.getElementById('floating-reaction-container');
                return;
            }
            this.container = document.createElement('div');
            this.container.id = 'floating-reaction-container';
            this.container.className = 'floating-reaction-container';
            document.body.appendChild(this.container);
        }

        spawn(emoji, senderName = '') {
            this.ensureContainer();
            const bubble = document.createElement('div');
            bubble.className = 'floating-reaction-bubble';

            // 무작위 가로 오프셋 및 회전
            const xOffset = (Math.random() - 0.5) * 60;
            const rotate = (Math.random() - 0.5) * 40;
            const size = 28 + Math.floor(Math.random() * 16);

            bubble.style.setProperty('--fx-offset-x', `${xOffset}px`);
            bubble.style.setProperty('--fx-rotate', `${rotate}deg`);
            bubble.style.fontSize = `${size}px`;

            let innerHtml = `<span class="emoji-char">${emoji}</span>`;
            if (senderName) {
                innerHtml += `<span class="sender-tag">${senderName}</span>`;
            }
            bubble.innerHTML = innerHtml;

            this.container.appendChild(bubble);

            setTimeout(() => {
                if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
            }, 2400);
        }
    }

    // -------------------------------------------------------------
    // 4. Quick Chat Speech Bubble Helpers & Player Avatar Say
    // -------------------------------------------------------------
    function showSpeechBubble(targetElement, text, duration = 3500) {
        if (!targetElement) return;
        
        targetElement.classList.add('speech-bubble-anchor');

        // 기존 말풍선 제거
        const existing = targetElement.querySelector('.speech-bubble-popup');
        if (existing) existing.remove();

        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble-popup';
        bubble.innerText = text;
        targetElement.appendChild(bubble);

        setTimeout(() => {
            bubble.classList.add('speech-bubble-fadeout');
            setTimeout(() => {
                bubble.remove();
            }, 350);
        }, duration);
    }

    function sayOnPlayer(playerIdOrNickname, text) {
        if (!playerIdOrNickname || !text) return;

        let targetEl = null;
        // 1) stadium-pod 또는 player_id 기반 검색
        targetEl = document.querySelector(`[data-player-id="${playerIdOrNickname}"] .pod-avatar-wrapper`)
            || document.querySelector(`[data-player-id="${playerIdOrNickname}"]`)
            || document.getElementById(`captured-${playerIdOrNickname}`)
            || document.getElementById(`player-seat-${playerIdOrNickname}`);

        // 2) 닉네임 기반 텍스트 매칭 검색
        if (!targetEl) {
            const allPlayers = document.querySelectorAll('.stadium-pod, .player-box, .player-card, .player-tag, .seat-box');
            for (let el of allPlayers) {
                if (el.innerText.includes(playerIdOrNickname)) {
                    targetEl = el.querySelector('.pod-avatar-wrapper') || el.querySelector('.player-avatar') || el.querySelector('.player-header') || el;
                    break;
                }
            }
        }

        // 3) 내 플레이어 검색
        if (!targetEl && (playerIdOrNickname === 'me' || playerIdOrNickname === window.myPlayerId)) {
            targetEl = document.getElementById('my-rack-container') || document.getElementById('my-name') || document.querySelector('.player-header') || document.getElementById('my-captured');
        }

        if (targetEl) {
            showSpeechBubble(targetEl, text);
        }
    }

    // -------------------------------------------------------------
    // 5. 우측 일체형 아케이드 콘솔 제어 (Console Controller)
    // -------------------------------------------------------------
    let unreadCount = 0;

    function ensureConsoleBackdrop() {
        let backdrop = document.getElementById('console-backdrop');
        if (!backdrop && document.body) {
            backdrop = document.createElement('div');
            backdrop.id = 'console-backdrop';
            backdrop.className = 'console-backdrop';
            backdrop.addEventListener('click', () => {
                toggleConsole(false);
            });
            document.body.appendChild(backdrop);
        }
        return backdrop;
    }

    function ensureConsoleReopenTab() {
        let tab = document.getElementById('console-reopen-tab');
        if (!tab && document.body) {
            tab = document.createElement('button');
            tab.id = 'console-reopen-tab';
            tab.className = 'console-reopen-tab';
            tab.type = 'button';
            tab.title = '채팅 및 대기실 열기';
            tab.innerHTML = `
                <span class="tab-icon">💬</span>
                <span class="tab-label">채팅 & 대기실</span>
                <span class="tab-badge" id="reopen-tab-badge" style="display:none;">0</span>
            `;
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleConsole(true);
            });
            document.body.appendChild(tab);
        }
        return tab;
    }

    function toggleConsole(forceState = null) {
        const arenaMain = document.getElementById('arena-main') || document.getElementById('arena') || document.querySelector('.arena-main');
        if (!arenaMain) return;

        const isCollapsed = arenaMain.classList.contains('console-collapsed');
        const shouldCollapse = (forceState !== null) ? !forceState : !isCollapsed;
        const reopenTab = ensureConsoleReopenTab();
        const backdrop = ensureConsoleBackdrop();

        if (shouldCollapse) {
            arenaMain.classList.add('console-collapsed');
            arenaMain.classList.remove('console-open');
            if (reopenTab) reopenTab.classList.add('visible');
            if (backdrop) backdrop.classList.remove('active');
        } else {
            arenaMain.classList.remove('console-collapsed');
            arenaMain.classList.add('console-open');
            if (reopenTab) reopenTab.classList.remove('visible');
            if (backdrop && window.innerWidth <= 768) {
                backdrop.classList.add('active');
            }
            unreadCount = 0;
            updateUnreadBadge();
        }
    }

    function incrementUnread() {
        const arenaMain = document.getElementById('arena-main') || document.getElementById('arena') || document.querySelector('.arena-main');
        if (arenaMain && arenaMain.classList.contains('console-collapsed')) {
            unreadCount++;
            updateUnreadBadge();
        }
    }

    function updateUnreadBadge() {
        const badges = document.querySelectorAll('.unread-badge, #mobile-player-count, #unread-count, #reopen-tab-badge');
        badges.forEach(b => {
            if (unreadCount > 0) {
                b.innerText = unreadCount;
                b.style.display = 'inline-block';
                b.classList.add('has-unread');
            } else {
                b.style.display = 'none';
                b.classList.remove('has-unread');
            }
        });
    }

    function sendQuickReaction(emoji) {
        const input = document.getElementById('chat-input') || document.querySelector('.console-text-input');
        if (input) {
            input.value = emoji;
            const form = input.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }
    }

    // -------------------------------------------------------------
    // 7. Special Cut-in Banner Effect (광땡, 멍따, 쓸, 폭탄 등)
    // -------------------------------------------------------------
    function triggerCutInBanner(title, subtitle = '', accentColor = '#fbbf24') {
        const overlay = document.createElement('div');
        overlay.className = 'cutin-banner-overlay';
        overlay.innerHTML = `
            <div class="cutin-banner-card" style="border-color: ${accentColor}; box-shadow: 0 0 30px ${accentColor}66;">
                <div class="cutin-banner-badge" style="background: ${accentColor};">SPECIAL</div>
                <div class="cutin-banner-title">${title}</div>
                ${subtitle ? `<div class="cutin-banner-subtitle">${subtitle}</div>` : ''}
            </div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add('cutin-exit');
            setTimeout(() => overlay.remove(), 400);
        }, 1800);
    }

    // -------------------------------------------------------------
    // 8. Social Dock UI Component (Clean Integration into Console)
    // -------------------------------------------------------------
    function mountSocialDock(onSendReaction, onSendQuickChat) {
        // 일체형 아케이드 콘솔 내부의 대화 입력창(#chat-input)을 가리는 중복 플로팅 독 차단
        // 콘솔 하단 도크(.console-bottom-dock)에 정규 퀵 리액션 바가 이미 완벽히 연동되어 있음
        const existing = document.getElementById('modern-social-dock');
        if (existing) existing.remove();
        return;
    }

    // -------------------------------------------------------------
    // Global GameFX Namespace Export
    // -------------------------------------------------------------
    const audioInstance = new WebAudioSynth();
    const reactionInstance = new FloatingReactionEngine();

    // 모바일 접속 시 기본적으로 100% 풀스크린 게임판 제공 (콘솔 자동 닫힘)
    if (typeof window !== 'undefined') {
        const checkMobileInit = () => {
            if (window.innerWidth <= 768) {
                const arenaMain = document.getElementById('arena-main') || document.getElementById('arena') || document.querySelector('.arena-main');
                if (arenaMain) {
                    arenaMain.classList.add('console-collapsed');
                    arenaMain.classList.remove('console-open');
                    const tab = ensureConsoleReopenTab();
                    if (tab) tab.classList.add('visible');
                }
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkMobileInit);
        } else {
            checkMobileInit();
        }
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                const backdrop = document.getElementById('console-backdrop');
                if (backdrop) backdrop.classList.remove('active');
            }
        });
    }

    // -------------------------------------------------------------
    // 9. Unified Chat Stream Engine (4대 게임 공통 대화 렌더러)
    // -------------------------------------------------------------
    function fxEscapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }

    function appendChatBubble(container, chat, myNick, autoScroll = true) {
        if (!container || !chat) return;
        
        const safeMyNick = (typeof myNick === 'string') ? myNick : '';
        const isSystem = !!chat.system;
        const isMine = !isSystem && !!safeMyNick && (chat.nickname === safeMyNick);
        
        const row = document.createElement('div');
        row.className = `console-chat-row ${isSystem ? 'system' : (isMine ? 'mine' : 'other')}`;
        
        const chatTime = chat.timestamp ? new Date(chat.timestamp) : new Date();
        const timeStr = chatTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isSystem) {
            row.innerHTML = `<div class="console-chat-system-msg">${fxEscapeHtml(chat.text)}</div>`;
        } else if (isMine) {
            row.innerHTML = `
                <div class="console-chat-bubble mine">
                    <span class="bubble-text">${fxEscapeHtml(chat.text)}</span>
                </div>
                <span class="console-chat-time">${timeStr}</span>
            `;
        } else {
            const senderColor = chat.color || '#38bdf8';
            row.innerHTML = `
                <div class="console-chat-sender" style="color: ${senderColor};">${fxEscapeHtml(chat.nickname)}</div>
                <div class="console-chat-bubble other">
                    <span class="bubble-text">${fxEscapeHtml(chat.text)}</span>
                </div>
                <span class="console-chat-time">${timeStr}</span>
            `;
        }
        
        container.appendChild(row);
        if (autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function renderChatStream(container, logs, myNick) {
        if (!container) return;
        container.innerHTML = '';
        const list = Array.isArray(logs) ? logs : [];
        const safeMyNick = (typeof myNick === 'string') ? myNick : '';
        list.forEach(chat => {
            appendChatBubble(container, chat, safeMyNick, false);
        });
        container.scrollTop = container.scrollHeight;
    }

    window.GameFX = {
        audio: audioInstance,
        reactions: reactionInstance,
        shake: triggerScreenShake,
        showBubble: showSpeechBubble,
        say: sayOnPlayer,
        toggleConsole: toggleConsole,
        toggleDrawer: toggleConsole,
        incrementUnread: incrementUnread,
        quickReaction: sendQuickReaction,
        cutIn: triggerCutInBanner,
        mountDock: mountSocialDock,
        renderChatStream: renderChatStream,
        appendChatBubble: appendChatBubble
    };
})();

