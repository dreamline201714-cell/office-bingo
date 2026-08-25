#!/usr/bin/env python3
"""
Office Games Live Unified Server (Bingo + Rummikub + Seotda + GoStop Fully Integrated)
"""

import asyncio
import http
import json
import mimetypes
import os
import random
import string
import sys
import time

import psycopg2
from psycopg2.extras import RealDictCursor

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = int(os.environ.get("PORT", 8000))
PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))
TURN_DURATION_SECONDS = 15

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:OfficeBingo2026Db@db.clsavoupapzxeyfybevr.supabase.co:5432/postgres')

def get_db_connection():
    if not DATABASE_URL: return None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode='require')
        return conn
    except Exception: return None

def get_user_chips_from_db(nickname: str, default_chips: int = 10000):
    conn = get_db_connection()
    if not conn: return default_chips
    try:
        with conn.cursor() as cur:
            sql = "SELECT wins FROM daily_stats WHERE game_type = 'CHIPS' AND nickname = %s;"
            cur.execute(sql, (nickname,))
            row = cur.fetchone()
            if row: return row[0]
            return default_chips
    except Exception: return default_chips
    finally: conn.close()

def save_user_chips_to_db(nickname: str, chips: int):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO daily_stats (game_type, nickname, play_date, wins)
                VALUES ('CHIPS', %s, CURRENT_DATE, %s)
                ON CONFLICT (game_type, nickname, play_date)
                DO UPDATE SET wins = %s;
            """
            cur.execute(sql, (nickname, chips, chips))
            conn.commit()
    except Exception: conn.rollback()
    finally: conn.close()

def record_daily_win(game_type: str, nickname: str):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO daily_stats (game_type, nickname, play_date, wins)
                VALUES (UPPER(%s), %s, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date, 1)
                ON CONFLICT (game_type, nickname, play_date)
                DO UPDATE SET wins = daily_stats.wins + 1;
            """
            cur.execute(sql, (game_type, nickname))
            conn.commit()
    except Exception as e:
        print(f"[DB ERROR] record_daily_win: {e}")
        conn.rollback()
    finally: conn.close()

def get_today_top_winner(game_type: str):
    conn = get_db_connection()
    if not conn: return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            sql = """
                SELECT nickname, wins 
                FROM daily_stats 
                WHERE UPPER(game_type) = UPPER(%s) 
                  AND play_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
                  AND wins > 0
                ORDER BY wins DESC, nickname ASC LIMIT 1;
            """
            cur.execute(sql, (game_type,))
            row = cur.fetchone()
            if row: return dict(row)
            return None
    except Exception as e:
        print(f"[DB ERROR] get_today_top_winner: {e}")
        return None
    finally: conn.close()

ROOMS = {}
TODAY_KING_CACHE = {}

async def update_today_king_loop():
    global TODAY_KING_CACHE
    while True:
        try:
            for g_type in ['BINGO', 'RUMMIKUB', 'SEOTDA', 'GOSTOP']:
                king_data = await asyncio.to_thread(get_today_top_winner, g_type)
                if king_data: TODAY_KING_CACHE[g_type] = king_data
        except Exception: pass
        await asyncio.sleep(10)

AVATAR_COLORS = ["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E44AD", "#00ACC1", "#D81B60", "#6D4C41"]
TILE_COLORS = ["red", "blue", "black", "orange"]

SEOTDA_CARDS_DECK = [
    {'id': 'c_1_1', 'month': 1, 'is_kwang': True, 'name': '1월 광'}, {'id': 'c_1_2', 'month': 1, 'is_kwang': False, 'name': '1월 피'},
    {'id': 'c_2_1', 'month': 2, 'is_kwang': False, 'name': '2월 십'}, {'id': 'c_2_2', 'month': 2, 'is_kwang': False, 'name': '2월 피'},
    {'id': 'c_3_1', 'month': 3, 'is_kwang': True, 'name': '3월 광'}, {'id': 'c_3_2', 'month': 3, 'is_kwang': False, 'name': '3월 피'},
    {'id': 'c_4_1', 'month': 4, 'is_kwang': False, 'name': '4월 십'}, {'id': 'c_4_2', 'month': 4, 'is_kwang': False, 'name': '4월 피'},
    {'id': 'c_5_1', 'month': 5, 'is_kwang': False, 'name': '5월 십'}, {'id': 'c_5_2', 'month': 5, 'is_kwang': False, 'name': '5월 피'},
    {'id': 'c_6_1', 'month': 6, 'is_kwang': False, 'name': '6월 십'}, {'id': 'c_6_2', 'month': 6, 'is_kwang': False, 'name': '6월 피'},
    {'id': 'c_7_1', 'month': 7, 'is_kwang': False, 'name': '7월 십'}, {'id': 'c_7_2', 'month': 7, 'is_kwang': False, 'name': '7월 피'},
    {'id': 'c_8_1', 'month': 8, 'is_kwang': True, 'name': '8월 광'}, {'id': 'c_8_2', 'month': 8, 'is_kwang': False, 'name': '8월 피'},
    {'id': 'c_9_1', 'month': 9, 'is_kwang': False, 'name': '9월 십'}, {'id': 'c_9_2', 'month': 9, 'is_kwang': False, 'name': '9월 피'},
    {'id': 'c_10_1', 'month': 10, 'is_kwang': False, 'name': '10월 십'}, {'id': 'c_10_2', 'month': 10, 'is_kwang': False, 'name': '10월 피'},
]

def generate_gostop_deck():
    card_configs = [
        {'m':1, 't':'KWANG', 'n':'1월 광'}, {'m':1, 't':'RIBBON', 'r':'홍단', 'n':'1월 홍단'}, {'m':1, 't':'PI', 'n':'1월 피'}, {'m':1, 't':'PI', 'n':'1월 피'},
        {'m':2, 't':'ANIMAL', 'n':'2월 꾀꼬리'}, {'m':2, 't':'RIBBON', 'r':'홍단', 'n':'2월 홍단'}, {'m':2, 't':'PI', 'n':'2월 피'}, {'m':2, 't':'PI', 'n':'2월 피'},
        {'m':3, 't':'KWANG', 'n':'3월 광'}, {'m':3, 't':'RIBBON', 'r':'홍단', 'n':'3월 홍단'}, {'m':3, 't':'PI', 'n':'3월 피'}, {'m':3, 't':'PI', 'n':'3월 피'},
        {'m':4, 't':'ANIMAL', 'n':'4월 두견새'}, {'m':4, 't':'RIBBON', 'r':'초단', 'n':'4월 초단'}, {'m':4, 't':'PI', 'n':'4월 피'}, {'m':4, 't':'PI', 'n':'4월 피'},
        {'m':5, 't':'ANIMAL', 'n':'5월 난초'}, {'m':5, 't':'RIBBON', 'r':'초단', 'n':'5월 초단'}, {'m':5, 't':'PI', 'n':'5월 피'}, {'m':5, 't':'PI', 'n':'5월 피'},
        {'m':6, 't':'ANIMAL', 'n':'6월 나비'}, {'m':6, 't':'RIBBON', 'r':'청단', 'n':'6월 청단'}, {'m':6, 't':'PI', 'n':'6월 피'}, {'m':6, 't':'PI', 'n':'6월 피'},
        {'m':7, 't':'ANIMAL', 'n':'7월 멧돼지'}, {'m':7, 't':'RIBBON', 'r':'초단', 'n':'7월 초단'}, {'m':7, 't':'PI', 'n':'7월 피'}, {'m':7, 't':'PI', 'n':'7월 피'},
        {'m':8, 't':'KWANG', 'n':'8월 광'}, {'m':8, 't':'ANIMAL', 'n':'8월 기러기'}, {'m':8, 't':'PI', 'n':'8월 피'}, {'m':8, 't':'PI', 'n':'8월 피'},
        {'m':9, 't':'ANIMAL', 'n':'9월 국진'}, {'m':9, 't':'RIBBON', 'r':'청단', 'n':'9월 청단'}, {'m':9, 't':'PI', 'n':'9월 피'}, {'m':9, 't':'PI', 'n':'9월 피'},
        {'m':10, 't':'ANIMAL', 'n':'10월 사슴'}, {'m':10, 't':'RIBBON', 'r':'청단', 'n':'10월 청단'}, {'m':10, 't':'PI', 'n':'10월 피'}, {'m':10, 't':'PI', 'n':'10월 피'},
        {'m':11, 't':'KWANG', 'n':'11월 광'}, {'m':11, 't':'DOUBLE_PI', 'n':'11월 쌍피'}, {'m':11, 't':'PI', 'n':'11월 피'}, {'m':11, 't':'PI', 'n':'11월 피'},
        {'m':12, 't':'KWANG', 'n':'12월 비광'}, {'m':12, 't':'ANIMAL', 'n':'12월 열끗'}, {'m':12, 't':'RIBBON', 'r':'띠', 'n':'12월 띠'}, {'m':12, 't':'DOUBLE_PI', 'n':'12월 쌍피'}
    ]
    deck = []
    idx = 1
    for c in card_configs:
        deck.append({'id': f"g_{idx}", 'month': c['m'], 'type': c['t'], 'ribbon_type': c.get('r', ''), 'name': c['n']})
        idx += 1
    random.shuffle(deck)
    return deck

def generate_room_code(length=6):
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choice(chars) for _ in range(length))
        if code not in ROOMS: return code

def get_unique_color(used_colors):
    available = [c for c in AVATAR_COLORS if c not in used_colors]
    if available: return random.choice(available)
    return '#' + ''.join(random.choices('0123456789ABCDEF', k=6))

def generate_rummikub_deck():
    deck = []
    tile_id = 1
    for color in TILE_COLORS:
        for num in range(1, 14):
            for _ in range(2):
                deck.append({'id': f"t_{tile_id}", 'color': color, 'number': num, 'is_joker': False})
                tile_id += 1
    deck.append({'id': f"t_{tile_id}", 'color': 'joker', 'number': 0, 'is_joker': True})
    deck.append({'id': f"t_{tile_id+1}", 'color': 'joker', 'number': 0, 'is_joker': True})
    random.shuffle(deck)
    return deck

def calculate_bingo_lines(board, marked_indices, size):
    if not board or len(board) < size * size: return 0
    marked_set = set(marked_indices)
    lines = 0
    for r in range(size):
        if all((r * size + c) in marked_set for c in range(size)): lines += 1
    for c in range(size):
        if all((r * size + c) in marked_set for r in range(size)): lines += 1
    if all((i * size + i) in marked_set for i in range(size)): lines += 1
    if all((i * size + (size - 1 - i)) in marked_set for i in range(size)): lines += 1
    return lines

def generate_player_board(word_pool, size):
    total_cells = size * size
    words = list(word_pool) if word_pool else []
    if len(words) < total_cells:
        extra_needed = total_cells - len(words)
        for i in range(1, extra_needed + 1): words.append(f"단어 {i}")
    return random.sample(words, len(words))[:total_cells]

def evaluate_seotda_hand(card1, card2):
    m1, m2 = card1['month'], card2['month']
    kw1, kw2 = card1['is_kwang'], card2['is_kwang']
    
    if kw1 and kw2:
        if (m1 == 3 and m2 == 8) or (m1 == 8 and m2 == 3): return (1000, "삼팔광땡 👑", "3·8 광땡")
        if (m1 == 1 and m2 == 8) or (m1 == 8 and m2 == 1): return (990, "일팔광땡 🌟", "1·8 광땡")
        if (m1 == 1 and m2 == 3) or (m1 == 3 and m2 == 1): return (980, "일삼광땡 🌟", "1·3 광땡")

    if m1 == m2:
        rank_name = f"{m1}땡" if m1 != 10 else "장땡 🔥"
        return (800 + m1 * 10, rank_name, f"{m1}땡")

    months = tuple(sorted([m1, m2]))
    special_hands = {
        (1, 2): (760, "알통 💪"), (1, 4): (750, "독사 🐍"), (4, 9): (740, "구빙 ❄️"),
        (6, 10): (730, "장빙 🧊"), (4, 10): (720, "장사 🐯"), (4, 6): (710, "세륙 ⚡")
    }
    if months in special_hands:
        score, name = special_hands[months]
        return (score, name, name)

    digit_sum = (m1 + m2) % 10
    if digit_sum == 9: return (100 + digit_sum, "갑오 (9끗) ✨", "갑오")
    elif digit_sum == 0: return (100, "망통 (0끗) 😭", "망통")
    else: return (100 + digit_sum, f"{digit_sum}끗", f"{digit_sum}끗")

def start_seotda_round(room):
    deck = list(SEOTDA_CARDS_DECK)
    random.shuffle(deck)
    room['deck'] = deck
    room['pot'] = 0
    base_ante = room.get('base_ante', 100)
    room['last_raise_amount'] = base_ante
    room['betting_turns'] = 0

    all_ws = list(room['players'].keys())
    if 'dealer_ws' in room and room['dealer_ws'] in all_ws:
        dealer_idx = all_ws.index(room['dealer_ws'])
        room['turn_order'] = all_ws[dealer_idx:] + all_ws[:dealer_idx]
    else:
        room['turn_order'] = all_ws

    room['current_turn_index'] = 0

    for p_ws, p in room['players'].items():
        p['is_folded'] = False
        p['current_bet'] = base_ante
        p['chips'] = max(0, p['chips'] - base_ante)
        room['pot'] += base_ante
        c1, c2 = room['deck'].pop(), room['deck'].pop()
        p['hand'] = [c1, c2]
        score, jokbo_full, jokbo_short = evaluate_seotda_hand(c1, c2)
        p['jokbo_score'] = score
        p['jokbo_name'] = jokbo_full

    room['chat_logs'].append({'system': True, 'text': f"🎴 새로운 판이 시작되었습니다! (학교값 {base_ante}칩 차감)"})

# ★ 고스톱 정밀 점수 및 박 배수 계산 함수 ★
def calculate_gostop_score(player, opponents, is_two_player=True):
    captured_list = player.get('captured', [])
    if not captured_list: 
        return {'final_score': 0, 'score_breakdown': [], 'penalty_multipliers': {}}
        
    score = 0
    score_breakdown = []
    
    kwangs = [c for c in captured_list if c.get('type') == 'KWANG']
    animals = [c for c in captured_list if c.get('type') == 'ANIMAL']
    ribbons = [c for c in captured_list if c.get('type') == 'RIBBON']
    
    # 1. 광 점수
    kw_cnt = len(kwangs)
    has_bi_kwang = any(c.get('month') == 12 for c in kwangs)
    if kw_cnt == 5: 
        score += 15; score_breakdown.append("5광 (15점)")
    elif kw_cnt == 4: 
        score += 4; score_breakdown.append("4광 (4점)")
    elif kw_cnt == 3: 
        pts = 2 if has_bi_kwang else 3
        score += pts; score_breakdown.append(f"3광 ({pts}점)")

    # 2. 열끗 및 고도리
    an_cnt = len(animals)
    godori_months = {2, 4, 8}
    captured_godori_months = {c.get('month') for c in animals if c.get('month') in godori_months}
    if godori_months.issubset(captured_godori_months): 
        score += 5; score_breakdown.append("고도리 (5점)")
    if an_cnt >= 5: 
        score += (an_cnt - 4); score_breakdown.append(f"열끗 {an_cnt}장 ({an_cnt - 4}점)")

    # 3. 띠 및 홍단/청단/초단
    hong_dan = {c.get('month') for c in ribbons if c.get('ribbon_type') == '홍단'}
    ching_dan = {c.get('month') for c in ribbons if c.get('ribbon_type') == '청단'}
    cho_dan = {c.get('month') for c in ribbons if c.get('ribbon_type') == '초단'}

    if {1, 2, 3}.issubset(hong_dan): score += 3; score_breakdown.append("홍단 (3점)")
    if {6, 9, 10}.issubset(ching_dan): score += 3; score_breakdown.append("청단 (3점)")
    if {4, 5, 7}.issubset(cho_dan): score += 3; score_breakdown.append("초단 (3점)")
    rb_cnt = len(ribbons)
    if rb_cnt >= 5: score += (rb_cnt - 4); score_breakdown.append(f"띠 {rb_cnt}장 ({rb_cnt - 4}점)")

    # 4. 피 점수 (쌍피=2장 계산)
    pi_score = sum(2 if c.get('type') == 'DOUBLE_PI' else 1 for c in captured_list if c.get('type') in ['PI', 'DOUBLE_PI'])
    if pi_score >= 10: 
        score += (pi_score - 9); score_breakdown.append(f"피 {pi_score}장 ({pi_score - 9}점)")

    # 5. GO 보너스 및 배수
    go_count = player.get('go_count', 0)
    final_score = score
    if go_count == 1: final_score += 1
    elif go_count == 2: final_score += 2
    elif go_count >= 3:
        multiplier = 2 ** (go_count - 2)
        final_score = (final_score + (go_count - 2)) * multiplier
        score_breakdown.append(f"{go_count}고 ({multiplier}배 승수)")

    # 6. 흔들기 / 멍따 배수
    mult = 1
    shook = player.get('shook_count', 0)
    if shook > 0:
        mult *= (2 ** shook)
        score_breakdown.append(f"흔들기 ({2 ** shook}배)")
    if an_cnt >= 7:
        mult *= 2
        score_breakdown.append("멍따 (2배)")
    final_score *= mult

    # 7. 상대방 박(Bak) 배수 계산
    penalty_multipliers = {}
    for opp in opponents:
        opp_m = 1
        opp_cap = opp.get('captured', [])
        opp_pi = sum(2 if c.get('type') == 'DOUBLE_PI' else 1 for c in opp_cap if c.get('type') in ['PI', 'DOUBLE_PI'])
        opp_kw = sum(1 for c in opp_cap if c.get('type') == 'KWANG')
        opp_an = sum(1 for c in opp_cap if c.get('type') == 'ANIMAL')

        # 피박
        limit = 5 if is_two_player else 2
        if pi_score >= 10 and 1 <= opp_pi <= limit:
            opp_m *= 2; score_breakdown.append(f"[{opp['nickname']}] 피박 (2배)")
        # 광박
        if kw_cnt >= 3 and opp_kw == 0:
            opp_m *= 2; score_breakdown.append(f"[{opp['nickname']}] 광박 (2배)")
        # 멍박
        if an_cnt >= 7 and opp_an == 0:
            opp_m *= 2; score_breakdown.append(f"[{opp['nickname']}] 멍박 (2배)")

        penalty_multipliers[opp['id']] = opp_m

    return {
        'final_score': final_score,
        'score_breakdown': score_breakdown,
        'penalty_multipliers': penalty_multipliers
    }

def steal_pi_from_opponents(room, winner_ws, count=1):
    winner = room['players'][winner_ws]
    stolen_total = 0
    for ws, opp in room['players'].items():
        if ws != winner_ws and not opp.get('is_spectator', False):
            pi_cards = [c for c in opp.get('captured', []) if c.get('type') in ['PI', 'DOUBLE_PI']]
            if pi_cards:
                take_card = pi_cards[0]
                opp['captured'].remove(take_card)
                winner['captured'].append(take_card)
                stolen_total += 1
    if stolen_total > 0:
        room['chat_logs'].append({'system': True, 'text': f"⚡ [{winner['nickname']}]님이 상대 피 {stolen_total}장을 뺏어왔습니다!"})

def serialize_room_state(room_id, requester_ws=None):
    if room_id not in ROOMS: return None
    room = ROOMS[room_id]
    game_type = room['game_type']
    players_data = []

    current_ws = room['turn_order'][room['current_turn_index']] if room.get('turn_order') else None
    current_player_id = room['players'][current_ws]['id'] if current_ws and current_ws in room['players'] else None

    turn_time_limit = room.get('turn_time_limit', TURN_DURATION_SECONDS)
    time_left = turn_time_limit
    if room['status'] == 'PLAYING' and room.get('turn_start_time'):
        elapsed = int(time.time() - room['turn_start_time'])
        time_left = max(0, turn_time_limit - elapsed)

    for ws, player in room['players'].items():
        p_info = {
            'player_id': player['id'], 'nickname': player['nickname'],
            'is_host': player['is_host'], 'is_ready': player.get('is_ready', False),
            'color': player['color'], 'is_current_turn': (player['id'] == current_player_id),
            'wins': player.get('wins', 0)
        }
        if game_type == 'BINGO':
            p_info.update({
                'is_escaped': player.get('is_escaped', False),
                'escape_rank': player.get('escape_rank', 0),
                'score': player.get('score', 0),
                'board': player.get('board', []),
                'marked': list(player.get('marked', []))
            })
        elif game_type == 'RUMMIKUB':
            p_info.update({'tile_count': len(player.get('rack', [])), 'rack': player.get('rack', []) if requester_ws == ws else []})
        elif game_type == 'SEOTDA':
            hand = player.get('hand', [])
            visible_hand = hand if requester_ws == ws or room['status'] == 'SHOWDOWN' else [{'month': 0, 'is_kwang': False, 'name': '비공개'} for _ in hand]
            p_info.update({
                'chips': player.get('chips', 10000), 'current_bet': player.get('current_bet', 0),
                'is_folded': player.get('is_folded', False), 'hand': visible_hand,
                'jokbo_name': player.get('jokbo_name', '') if (requester_ws == ws or room['status'] == 'SHOWDOWN') else ''
            })
        elif game_type == 'GOSTOP':
            opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
            calc = calculate_gostop_score(player, opps, len(opps) == 1)
            player['score'] = calc['final_score']
            p_info.update({
                'chips': player.get('chips', 10000),
                'is_spectator': player.get('is_spectator', False),
                'hand': player.get('hand', []) if requester_ws == ws else [{'month': 0, 'type': 'UNKNOWN'} for _ in player.get('hand', [])],
                'captured': player.get('captured', []),
                'score': player['score'],
                'go_count': player.get('go_count', 0),
                'shook_count': player.get('shook_count', 0)
            })
        players_data.append(p_info)

    today_king = TODAY_KING_CACHE.get(game_type)

    state = {
        'room_id': room_id, 'game_type': game_type, 'status': room['status'],
        'title': room.get('title', '레트로 멀티 미니게임'),
        'current_turn_player_id': current_player_id, 'turn_time_limit': turn_time_limit,
        'turn_time_remaining': time_left, 'players': players_data, 'chat_logs': room['chat_logs'][-30:],
        'today_king': today_king
    }

    if game_type == 'BINGO':
        state['config'] = room.get('config', {})
    elif game_type == 'RUMMIKUB':
        state['table_sets'] = room.get('table_sets', [])
        state['rule_type'] = room.get('rule_type', 'official')
    elif game_type == 'SEOTDA':
        state['pot'] = room.get('pot', 0)
        state['last_bet_amount'] = room.get('last_raise_amount', 100)
        state['start_chips'] = room.get('start_chips', 10000)
        state['base_ante'] = room.get('base_ante', 100)
        state['dealer_player_id'] = room['players'][room['dealer_ws']]['id'] if 'dealer_ws' in room and room['dealer_ws'] in room['players'] else None
    elif game_type == 'GOSTOP':
        state['table_cards'] = room.get('table_cards', [])
        state['deck_count'] = len(room.get('deck', []))
        state['point_chip'] = room.get('point_chip', 100)
        state['turn_phase'] = room.get('turn_phase', 'PLAY_HAND')
        state['drawn_card'] = room.get('drawn_card', None)

    return state

async def broadcast_to_room(room_id, message_dict):
    if room_id not in ROOMS: return
    for ws in list(ROOMS[room_id]['players'].keys()):
        try:
            personalized_msg = dict(message_dict)
            if 'state' in personalized_msg:
                personalized_msg['state'] = serialize_room_state(room_id, requester_ws=ws)
            if hasattr(ws, 'send_json'): await ws.send_json(personalized_msg)
            else: await ws.send(json.dumps(personalized_msg, ensure_ascii=False))
        except Exception: pass

async def check_turn_timeouts():
    while True:
        await asyncio.sleep(1)
        now = time.time()
        for room_id, room in list(ROOMS.items()):
            if room.get('status') == 'PLAYING' and room.get('turn_start_time') and room.get('turn_order'):
                limit = room.get('turn_time_limit', TURN_DURATION_SECONDS)
                elapsed = int(now - room['turn_start_time'])
                
                if elapsed >= limit:
                    if room['current_turn_index'] >= len(room['turn_order']):
                        room['current_turn_index'] = 0
                        
                    current_ws = room['turn_order'][room['current_turn_index']]
                    player = room['players'].get(current_ws)
                    
                    if player:
                        if room['game_type'] == 'RUMMIKUB':
                            if room.get('deck'):
                                drawn_tile = room['deck'].pop()
                                player['rack'].append(drawn_tile)
                                room['chat_logs'].append({'system': True, 'text': f"⏱️ [{player['nickname']}]님의 시간이 초과되어 타일 1장을 자동 드로우하고 턴이 넘어가셨습니다."})
                            else:
                                room['chat_logs'].append({'system': True, 'text': f"⏱️ [{player['nickname']}]님의 시간이 초과되어 턴이 넘어가셨습니다."})
                            room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])

                        elif room['game_type'] == 'BINGO':
                            room['chat_logs'].append({'system': True, 'text': f"⏱️ [{player['nickname']}]님의 제한 시간이 초과되어 턴이 넘어가셨습니다."})
                            room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])

                        elif room['game_type'] == 'SEOTDA':
                            player['is_folded'] = True
                            room['chat_logs'].append({'system': True, 'text': f"⏱️ [{player['nickname']}]님이 배팅 제한시간 초과로 자동 기권(다이)되었습니다."})
                            active_ws = [p_ws for p_ws, p in room['players'].items() if not p['is_folded']]
                            if len(active_ws) <= 1:
                                if len(active_ws) == 1:
                                    winner_ws = active_ws[0]
                                    winner = room['players'][winner_ws]
                                    winner['chips'] += room['pot']
                                    room['dealer_ws'] = winner_ws
                                    room['chat_logs'].append({'system': True, 'text': f"🎉 모두 기권하여 [{winner['nickname']}]님이 {room['pot']} 칩을 획득했습니다!"})
                                room['status'] = 'SHOWDOWN'
                            else:
                                next_idx = (room['current_turn_index'] + 1) % len(room['turn_order'])
                                for _ in range(len(room['turn_order'])):
                                    candidate_ws = room['turn_order'][next_idx]
                                    candidate_p = room['players'][candidate_ws]
                                    if not candidate_p['is_folded'] and candidate_p['chips'] > 0:
                                        break
                                    next_idx = (next_idx + 1) % len(room['turn_order'])
                                room['current_turn_index'] = next_idx

                        elif room['game_type'] == 'GOSTOP':
                            opps = [p for w, p in room['players'].items() if w != current_ws and not p.get('is_spectator')]
                            is_two = (len(opps) == 1)

                            if room.get('turn_phase') == 'DECIDE_GO_STOP':
                                await finalize_gostop_game(room, current_ws)
                            elif room.get('turn_phase') == 'PLAY_HAND' and player['hand']:
                                auto_card = player['hand'][0]
                                player['hand'].remove(auto_card)
                                matched = [c for c in room['table_cards'] if c['month'] == auto_card['month']]
                                if matched:
                                    target = matched[0]
                                    room['table_cards'].remove(target)
                                    player['captured'].extend([auto_card, target])
                                    calc = calculate_gostop_score(player, opps, is_two)
                                    player['score'] = calc['final_score']
                                else:
                                    room['table_cards'].append(auto_card)
                                room['turn_phase'] = 'DRAW_DECK'
                                room['turn_start_time'] = time.time()

                            elif room.get('turn_phase') in ['DRAW_DECK', 'DRAW_DECK_CHOICE', 'DRAW_DECK_NO_MATCH']:
                                if room['deck']:
                                    deck_card = room['deck'].pop()
                                    deck_matched = [c for c in room['table_cards'] if c['month'] == deck_card['month']]
                                    if deck_matched:
                                        d_target = deck_matched[0]
                                        room['table_cards'].remove(d_target)
                                        player['captured'].extend([deck_card, d_target])
                                        calc = calculate_gostop_score(player, opps, is_two)
                                        player['score'] = calc['final_score']
                                    else:
                                        room['table_cards'].append(deck_card)
                                
                                await finish_gostop_turn(room, room_id)

                        room['turn_start_time'] = time.time()
                        await broadcast_to_room(room_id, {'type': 'ROOM_UPDATED', 'state': None})

async def start_background_tasks(app):
    app['timeout_checker'] = asyncio.create_task(check_turn_timeouts())
    app['king_updater'] = asyncio.create_task(update_today_king_loop())

async def cleanup_background_tasks(app):
    app['timeout_checker'].cancel()
    if 'king_updater' in app: app['king_updater'].cancel()
    await app['timeout_checker']

async def process_client_msg(ws, current_player_id, data, current_room_id):
    msg_type = data.get('type')

    if msg_type == 'CREATE_ROOM':
        game_type = data.get('game_type', 'BINGO')
        nickname = str(data.get('nickname', '방장')).strip() or '방장'
        room_id = generate_room_code()
        assigned_color = get_unique_color([])
        title = str(data.get('title', '레트로 실시간 게임')).strip() or '레트로 실시간 게임'

        if game_type == 'BINGO':
            size = int(data.get('size', 5))
            ROOMS[room_id] = {
                'room_id': room_id, 'game_type': 'BINGO', 'status': 'WAITING', 'turn_time_limit': TURN_DURATION_SECONDS, 'title': title,
                'config': {'size': size, 'target_lines': int(data.get('target_lines', size)), 'topic': data.get('topic', '자유 주제').strip() or '자유 주제', 'game_mode': data.get('game_mode', 'LOSER'), 'word_pool': data.get('word_pool', [])},
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'color': assigned_color, 'board': generate_player_board(data.get('word_pool', []), size), 'marked': set(), 'score': 0, 'wins': 0}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }
        elif game_type == 'RUMMIKUB':
            rule_type = data.get('rule_type', 'official')
            ROOMS[room_id] = {
                'room_id': room_id, 'game_type': 'RUMMIKUB', 'status': 'WAITING', 'turn_time_limit': int(data.get('turn_time_limit', 60)), 'title': title,
                'rule_type': rule_type,
                'deck': [], 'table_sets': [],
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'rack': [], 'color': assigned_color, 'wins': 0}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }
        elif game_type == 'SEOTDA':
            start_chips = int(data.get('start_chips', 10000))
            base_ante = int(data.get('base_ante', 100))
            saved_chips = await asyncio.to_thread(get_user_chips_from_db, nickname, start_chips)
            ROOMS[room_id] = {
                'room_id': room_id, 'game_type': 'SEOTDA', 'status': 'WAITING', 'turn_time_limit': 15, 'title': title,
                'start_chips': start_chips, 'base_ante': base_ante,
                'pot': 0, 'last_raise_amount': base_ante, 'deck': [],
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'color': assigned_color, 'chips': saved_chips, 'current_bet': 0, 'is_folded': False, 'hand': []}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }
        elif game_type == 'GOSTOP':
            start_chips = int(data.get('start_chips', 10000))
            point_chip = int(data.get('point_chip', 100))
            turn_time_limit = int(data.get('turn_time_limit', 15))
            saved_chips = await asyncio.to_thread(get_user_chips_from_db, nickname, start_chips)
            ROOMS[room_id] = {
                'room_id': room_id, 'game_type': 'GOSTOP', 'status': 'WAITING', 'turn_time_limit': turn_time_limit, 'title': title,
                'start_chips': start_chips, 'point_chip': point_chip,
                'deck': [], 'table_cards': [], 'turn_phase': 'PLAY_HAND', 'drawn_card': None,
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'color': assigned_color, 'chips': saved_chips, 'hand': [], 'captured': [], 'score': 0, 'go_count': 0, 'last_go_score': 0, 'shook_count': 0, 'is_spectator': False}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }

        res = {'type': 'ROOM_JOINED', 'room_id': room_id, 'game_type': game_type, 'player_id': current_player_id, 'is_host': True, 'state': serialize_room_state(room_id, requester_ws=ws)}
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))
        return room_id

    elif msg_type == 'JOIN_ROOM':
        room_id = data.get('room_id', '').upper().strip()
        nickname = str(data.get('nickname', '참여자')).strip() or '참여자'

        if room_id not in ROOMS:
            err = {'type': 'ERROR', 'message': '존재하지 않는 방 코드입니다.'}
            if hasattr(ws, 'send_json'): await ws.send_json(err)
            else: await ws.send(json.dumps(err, ensure_ascii=False))
            return current_room_id

        room = ROOMS[room_id]
        game_type = room['game_type']
        assigned_color = get_unique_color([p['color'] for p in room['players'].values()])

        if game_type == 'BINGO':
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'color': assigned_color, 'board': generate_player_board(room['config']['word_pool'], room['config']['size']), 'marked': set(), 'score': 0, 'wins': 0}
        elif game_type == 'RUMMIKUB':
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'rack': [], 'color': assigned_color, 'wins': 0}
        elif game_type == 'SEOTDA':
            start_chips = room.get('start_chips', 10000)
            saved_chips = await asyncio.to_thread(get_user_chips_from_db, nickname, start_chips)
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'color': assigned_color, 'chips': saved_chips, 'current_bet': 0, 'is_folded': False, 'hand': []}
        elif game_type == 'GOSTOP':
            saved_chips = await asyncio.to_thread(get_user_chips_from_db, nickname, room.get('start_chips', 10000))
            is_spectator = len([p for p in room['players'].values() if not p.get('is_spectator', False)]) >= 3
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'color': assigned_color, 'chips': saved_chips, 'hand': [], 'captured': [], 'score': 0, 'go_count': 0, 'last_go_score': 0, 'shook_count': 0, 'is_spectator': is_spectator}

        room['chat_logs'].append({'system': True, 'text': f"🎉 '{nickname}'님이 입장하셨습니다."})
        res = {'type': 'ROOM_JOINED', 'room_id': room_id, 'game_type': room['game_type'], 'player_id': current_player_id, 'is_host': False, 'state': serialize_room_state(room_id, requester_ws=ws)}
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))
        await broadcast_to_room(room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return room_id

    elif msg_type == 'UPDATE_BOARD':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players']:
            board = data.get('board', [])
            room['players'][ws]['board'] = board
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'UPDATE_CONFIG':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'BINGO' and ws in room['players'] and room['players'][ws]['is_host']:
            size = int(data.get('size', room['config']['size']))
            topic = str(data.get('topic', room['config']['topic'])).strip()
            target_lines = int(data.get('target_lines', room['config'].get('target_lines', size)))
            word_pool = data.get('word_pool', room['config'].get('word_pool', []))

            room['config']['size'] = size
            room['config']['topic'] = topic
            room['config']['target_lines'] = target_lines
            room['config']['word_pool'] = word_pool

            room['chat_logs'].append({'system': True, 'text': f"⚙️ 방장에 의해 빙고 설정이 변경되었습니다. ({size}x{size}, 주제: {topic})"})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'MARK_CELL':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'BINGO' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                try:
                    cell_index = int(data.get('cell_index'))
                except (ValueError, TypeError):
                    return current_room_id

                player = room['players'][ws]
                board = player.get('board', [])
                
                if 0 <= cell_index < len(board):
                    target_word = board[cell_index].strip()
                    if target_word:
                        size = room['config']['size']
                        target_lines = room['config'].get('target_lines', size)
                        game_mode = room['config'].get('game_mode', 'WINNER')

                        for p_ws, p in room['players'].items():
                            p_board = p.get('board', [])
                            for idx, w in enumerate(p_board):
                                if w.strip() == target_word:
                                    p['marked'].add(idx)
                            p['score'] = calculate_bingo_lines(p_board, p['marked'], size)

                        room['chat_logs'].append({'system': True, 'text': f"🎯 [{player['nickname']}]님이 '{target_word}'을(를) 선택했습니다!"})

                        if game_mode == 'WINNER':
                            winners = [p for p in room['players'].values() if p['score'] >= target_lines]
                            if winners:
                                for w in winners:
                                    w['wins'] = w.get('wins', 0) + 1
                                    asyncio.create_task(asyncio.to_thread(record_daily_win, 'BINGO', str(w['nickname']).strip()))
                                    
                                winner_names = ", ".join([w['nickname'] for w in winners])
                                room['chat_logs'].append({'system': True, 'text': f"🏆 축하합니다! [{winner_names}]님이 목표 ({target_lines}줄)를 달성하여 우승하셨습니다!"})
                                room['status'] = 'WAITING'
                            else:
                                room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
                                room['turn_start_time'] = time.time()

                        elif game_mode == 'LOSER':
                            already_escaped_count = sum(1 for p in room['players'].values() if p.get('is_escaped', False))
                            newly_escaped = []

                            for p in room['players'].values():
                                if not p.get('is_escaped', False) and p['score'] >= target_lines:
                                    already_escaped_count += 1
                                    p['is_escaped'] = True
                                    p['escape_rank'] = already_escaped_count
                                    
                                    if already_escaped_count == 1:
                                        p['wins'] = p.get('wins', 0) + 1
                                        asyncio.create_task(asyncio.to_thread(record_daily_win, 'BINGO', str(p['nickname']).strip()))
                                        
                                    newly_escaped.append(f"[{p['nickname']}] ({already_escaped_count}등 탈출!)")

                            if newly_escaped:
                                room['chat_logs'].append({'system': True, 'text': f"🏃‍♂️ 탈출 성공: {', '.join(newly_escaped)}"})

                            remaining_players = [p for p in room['players'].values() if not p.get('is_escaped', False)]

                            if len(remaining_players) <= 1:
                                loser_name = remaining_players[0]['nickname'] if remaining_players else "전원 탈출"
                                room['chat_logs'].append({'system': True, 'text': f"💣 [패자 결정] 끝까지 탈출하지 못한 [{loser_name}]님이 최종 벌칙 당첨자로 결정되었습니다!"})
                                room['status'] = 'WAITING'
                            else:
                                next_idx = (room['current_turn_index'] + 1) % len(room['turn_order'])
                                for _ in range(len(room['turn_order'])):
                                    candidate_ws = room['turn_order'][next_idx]
                                    candidate_p = room['players'][candidate_ws]
                                    if not candidate_p.get('is_escaped', False):
                                        break
                                    next_idx = (next_idx + 1) % len(room['turn_order'])

                                room['current_turn_index'] = next_idx
                                room['turn_start_time'] = time.time()

                        await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'SHAKE_HAND':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                player = room['players'][ws]
                month = data.get('month')
                player['shook_count'] = player.get('shook_count', 0) + 1
                room['chat_logs'].append({'system': True, 'text': f"👋 [{player['nickname']}]님이 {month}월 패를 흔들었습니다! (승리 시 2배)"})
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'MOVE_KUKJIN_TO_PI':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                player = room['players'][ws]
                kukjin = next((c for c in player['captured'] if c.get('month') == 9 and c.get('type') == 'ANIMAL'), None)
                if kukjin:
                    kukjin['type'] = 'DOUBLE_PI'
                    kukjin['name'] = '9월 국진(쌍피)'
                    
                    opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
                    calc = calculate_gostop_score(player, opps, len(opps) == 1)
                    player['score'] = calc['final_score']
                    
                    room['chat_logs'].append({'system': True, 'text': f"🔄 [{player['nickname']}]님이 국진 패를 [쌍피]로 이동시켰습니다!"})
                    await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'GOSTOP_DECISION':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws and room.get('turn_phase') == 'DECIDE_GO_STOP':
                decision = data.get('decision')
                player = room['players'][ws]

                if decision == 'GO':
                    player['go_count'] = player.get('go_count', 0) + 1
                    player['last_go_score'] = player['score']
                    room['chat_logs'].append({'system': True, 'text': f"🚀 [{player['nickname']}]님이 [{player['go_count']}고!]를 선언하셨습니다!"})
                    
                    room['turn_phase'] = 'PLAY_HAND'
                    room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
                    room['turn_start_time'] = time.time()
                    await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})
                else:
                    room['chat_logs'].append({'system': True, 'text': f"🛑 [{player['nickname']}]님이 [스톱!]을 선언하셨습니다."})
                    await finalize_gostop_game(room, ws)

    # ★ 1. PREPARE_GAME 처리 구역 보완 (바닥 4장 중복 재주섞기 & 손패 총통 즉시승리) ★
    elif msg_type == 'PREPARE_GAME':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP':
            room['status'] = 'SHUFFLING'
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})
            
            await asyncio.sleep(1.2)
            room['status'] = 'PLAYING'
            active_players = [s for s, p in room['players'].items() if not p.get('is_spectator', False)]
            random.shuffle(active_players)
            room['turn_order'] = active_players
            room['current_turn_index'] = 0
            room['turn_phase'] = 'PLAY_HAND'
            room['drawn_card'] = None

            deck = generate_gostop_deck()
            num_players = len(active_players)
            hand_count = 10 if num_players == 2 else 7
            table_count = 8 if num_players == 2 else 6

            table_cards = [deck.pop() for _ in range(table_count)]

            # 바닥 패 검사: 동일 월 4장이 나오면 다시 섞음
            table_months = [c['month'] for c in table_cards]
            for m in range(1, 13):
                if table_months.count(m) == 4:
                    room['chat_logs'].append({'system': True, 'text': f"🎴 바닥에 {m}월 4장이 모여 패를 다시 섞습니다!"})
                    deck = generate_gostop_deck()
                    table_cards = [deck.pop() for _ in range(table_count)]
                    break

            # 손패 나누기 및 손패 총통 검사
            chongtong_winner_ws = None
            for p_ws in active_players:
                p_hand = [deck.pop() for _ in range(hand_count)]
                room['players'][p_ws]['hand'] = p_hand
                room['players'][p_ws]['captured'] = []
                room['players'][p_ws]['score'] = 0
                room['players'][p_ws]['go_count'] = 0
                room['players'][p_ws]['last_go_score'] = 0
                room['players'][p_ws]['shook_count'] = 0

                hand_months = [c['month'] for c in p_hand]
                for m in range(1, 13):
                    if hand_months.count(m) == 4:
                        chongtong_winner_ws = p_ws
                        room['chat_logs'].append({'system': True, 'text': f"👑 [{room['players'][p_ws]['nickname']}]님이 손패에 {m}월 4장(총통)을 모아 즉시 승리하셨습니다!"})
                        break

            room['deck'] = deck
            room['table_cards'] = table_cards
            room['turn_start_time'] = time.time()

            if chongtong_winner_ws:
                room['players'][chongtong_winner_ws]['score'] = 10
                await finalize_gostop_game(room, chongtong_winner_ws)
                return current_room_id

            room['chat_logs'].append({'system': True, 'text': f"🎴 대국 시작! (손패 {hand_count}장, 바닥 {table_count}장)"})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'PLAY_BOMB_CARDS':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws and room.get('turn_phase') == 'PLAY_HAND':
                card_ids = data.get('card_ids', [])
                month = data.get('month')
                player = room['players'][ws]

                bomb_cards = [c for c in player['hand'] if c['id'] in card_ids and c['month'] == month]
                for bc in bomb_cards: player['hand'].remove(bc)

                matched = [c for c in room['table_cards'] if c['month'] == month]
                if matched:
                    target = matched[0]
                    room['table_cards'].remove(target)
                    player['captured'].append(target)

                player['captured'].extend(bomb_cards)
                player['shook_count'] = player.get('shook_count', 0) + 1
                opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
                calc = calculate_gostop_score(player, opps, len(opps) == 1)
                player['score'] = calc['final_score']

                room['chat_logs'].append({'system': True, 'text': f"💣 [폭탄!] [{player['nickname']}]님이 {month}월 폭탄을 던졌습니다!"})
                steal_pi_from_opponents(room, ws, 1)

                room['played_card_ref'] = bomb_cards[0] if bomb_cards else None
                room['hand_matched_count'] = 1
                room['turn_phase'] = 'DRAW_DECK'
                room['turn_start_time'] = time.time()
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'PLAY_HAND_CARD':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws and room.get('turn_phase') == 'PLAY_HAND':
                card_id = data.get('card_id')
                target_card_id = data.get('target_card_id')
                player = room['players'][ws]
                played_card = next((c for c in player['hand'] if c['id'] == card_id), None)
                
                if played_card:
                    player['hand'].remove(played_card)
                    matched = [c for c in room['table_cards'] if c['month'] == played_card['month']]
                    
                    room['played_card_ref'] = played_card
                    room['hand_matched_count'] = 1 if matched else 0

                    opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
                    is_two = (len(opps) == 1)

                    if len(matched) == 3:
                        for target in list(matched):
                            room['table_cards'].remove(target)
                            player['captured'].append(target)
                        player['captured'].append(played_card)
                        calc = calculate_gostop_score(player, opps, is_two)
                        player['score'] = calc['final_score']
                        room['chat_logs'].append({'system': True, 'text': f"💥 [{player['nickname']}]님이 바닥의 3장을 한번에 쓸어왔습니다!"})
                        steal_pi_from_opponents(room, ws, 1)

                    elif matched and target_card_id:
                        target = next((c for c in matched if c['id'] == target_card_id), matched[0])
                        room['table_cards'].remove(target)
                        player['captured'].extend([played_card, target])
                        calc = calculate_gostop_score(player, opps, is_two)
                        player['score'] = calc['final_score']
                        room['chat_logs'].append({'system': True, 'text': f"🎯 [{player['nickname']}]님이 [{played_card['name']}]로 [{target['name']}]을(를) 먹었습니다."})
                    elif matched and not target_card_id and len(matched) == 1:
                        target = matched[0]
                        room['table_cards'].remove(target)
                        player['captured'].extend([played_card, target])
                        calc = calculate_gostop_score(player, opps, is_two)
                        player['score'] = calc['final_score']
                        room['chat_logs'].append({'system': True, 'text': f"🎯 [{player['nickname']}]님이 [{played_card['name']}]로 [{target['name']}]을(를) 먹었습니다."})
                    else:
                        room['table_cards'].append(played_card)
                        room['chat_logs'].append({'system': True, 'text': f"📥 [{player['nickname']}]님이 [{played_card['name']}]을(를) 바닥에 냈습니다."})
                    
                    room['turn_phase'] = 'DRAW_DECK'
                    room['turn_start_time'] = time.time()
                    await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'DRAW_DECK_CARD':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws and room.get('turn_phase') == 'DRAW_DECK':
                player = room['players'][ws]
                opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
                is_two = (len(opps) == 1)

                if room['deck']:
                    deck_card = room['deck'].pop()
                    room['drawn_card'] = deck_card
                    played_card = room.get('played_card_ref')
                    hand_matched_cnt = room.get('hand_matched_count', 0)

                    if played_card and hand_matched_cnt == 1 and deck_card['month'] == played_card['month']:
                        stolen_back = [c for c in player['captured'] if c['month'] == played_card['month']]
                        for sb in stolen_back:
                            if sb in player['captured']: player['captured'].remove(sb)
                            room['table_cards'].append(sb)
                        room['table_cards'].append(deck_card)
                        calc = calculate_gostop_score(player, opps, is_two)
                        player['score'] = calc['final_score']
                        room['chat_logs'].append({'system': True, 'text': f"😭 [싸쌌다!] [{player['nickname']}]님이 피를 쌌습니다! 바닥에 3장이 묶입니다."})
                        await finish_gostop_turn(room, current_room_id)

                    else:
                        deck_matched = [c for c in room['table_cards'] if c['month'] == deck_card['month']]
                        if len(deck_matched) >= 1:
                            room['turn_phase'] = 'DRAW_DECK_CHOICE'
                        else:
                            room['turn_phase'] = 'DRAW_DECK_NO_MATCH'

                    room['turn_start_time'] = time.time()
                    await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'CONFIRM_DECK_DRAW':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'GOSTOP' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws and room.get('turn_phase') in ['DRAW_DECK_CHOICE', 'DRAW_DECK_NO_MATCH']:
                player = room['players'][ws]
                deck_card = room.get('drawn_card')
                target_card_id = data.get('target_card_id')
                hand_matched_cnt = room.get('hand_matched_count', 0)

                opps = [p for w, p in room['players'].items() if w != ws and not p.get('is_spectator')]
                is_two = (len(opps) == 1)

                if deck_card:
                    matched_on_table = [c for c in room['table_cards'] if c['month'] == deck_card['month']]

                    if len(matched_on_table) == 3:
                        for target in matched_on_table:
                            room['table_cards'].remove(target)
                            player['captured'].append(target)
                        player['captured'].append(deck_card)
                        
                        calc = calculate_gostop_score(player, opps, is_two)
                        player['score'] = calc['final_score']
                        
                        room['chat_logs'].append({'system': True, 'text': f"💥 [{player['nickname']}]님이 덱에서 오픈된 패로 바닥의 3장을 싹 쓸어왔습니다!"})
                        steal_pi_from_opponents(room, ws, 1)

                    elif target_card_id:
                        target = next((c for c in room['table_cards'] if c['id'] == target_card_id), None)
                        if target:
                            room['table_cards'].remove(target)
                            player['captured'].extend([deck_card, target])
                            calc = calculate_gostop_score(player, opps, is_two)
                            player['score'] = calc['final_score']

                            if hand_matched_cnt == 0:
                                room['chat_logs'].append({'system': True, 'text': f"✨ [쪽!] [{player['nickname']}]님이 쪽으로 피 1장을 뺏어옵니다!"})
                                steal_pi_from_opponents(room, ws, 1)

                            elif hand_matched_cnt == 1:
                                room['chat_logs'].append({'system': True, 'text': f"⚡ [따닥!] [{player['nickname']}]님이 따닥으로 피 1장을 뺏어옵니다!"})
                                steal_pi_from_opponents(room, ws, 1)
                    else:
                        room['table_cards'].append(deck_card)

                if len(room['table_cards']) == 0:
                    room['chat_logs'].append({'system': True, 'text': f"🧹 [쓸!] [{player['nickname']}]님이 바닥을 싹 쓸었습니다!"})
                    steal_pi_from_opponents(room, ws, 1)

                await finish_gostop_turn(room, current_room_id)
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    # ★ 2. START_GAME 처리 구역 보완 ★
    elif msg_type == 'START_GAME':
        room = ROOMS.get(current_room_id)
        if not room: return current_room_id

        current_player = room['players'].get(ws)
        actual_ws = ws
        if not current_player:
            for p_ws, p in room['players'].items():
                if p['id'] == current_player_id:
                    current_player = p
                    actual_ws = p_ws
                    break

        if not current_player or not current_player.get('is_host'): return current_room_id
        ws = actual_ws

        room['status'] = 'PLAYING'
        player_sockets = list(room['players'].keys())
        random.shuffle(player_sockets)
        room['turn_order'] = player_sockets
        room['current_turn_index'] = 0

        if room['game_type'] == 'RUMMIKUB':
            deck = generate_rummikub_deck()
            room['table_sets'] = []
            for p_ws in player_sockets:
                room['players'][p_ws]['rack'] = [deck.pop() for _ in range(14)] if len(deck) >= 14 else []
            room['deck'] = deck
            room['chat_logs'].append({'system': True, 'text': "🧩 루미큐브가 시작되었습니다!"})

        elif room['game_type'] == 'SEOTDA':
            room['dealer_ws'] = ws
            start_seotda_round(room)

        elif room['game_type'] == 'BINGO':
            for p in room['players'].values():
                p['marked'] = set()
                p['score'] = 0
                p['is_escaped'] = False
                p['escape_rank'] = 0
            room['chat_logs'].append({'system': True, 'text': "🎯 새로운 빙고 게임이 시작되었습니다!"})

        elif room['game_type'] == 'GOSTOP':
            active_players = [s for s, p in room['players'].items() if not p.get('is_spectator', False)]
            random.shuffle(active_players)
            room['turn_order'] = active_players
            room['current_turn_index'] = 0
            room['turn_phase'] = 'PLAY_HAND'
            room['drawn_card'] = None

            deck = generate_gostop_deck()
            num_players = len(active_players)
            hand_count = 10 if num_players == 2 else 7
            table_count = 8 if num_players == 2 else 6

            table_cards = [deck.pop() for _ in range(table_count)]

            # 바닥 패 검사
            table_months = [c['month'] for c in table_cards]
            for m in range(1, 13):
                if table_months.count(m) == 4:
                    room['chat_logs'].append({'system': True, 'text': f"🎴 바닥에 {m}월 4장이 모여 패를 다시 섞습니다!"})
                    deck = generate_gostop_deck()
                    table_cards = [deck.pop() for _ in range(table_count)]
                    break

            # 손패 나누기 및 총통 검사
            chongtong_winner_ws = None
            for p_ws in active_players:
                p_hand = [deck.pop() for _ in range(hand_count)]
                room['players'][p_ws]['hand'] = p_hand
                room['players'][p_ws]['captured'] = []
                room['players'][p_ws]['score'] = 0
                room['players'][p_ws]['go_count'] = 0
                room['players'][p_ws]['shook_count'] = 0

                hand_months = [c['month'] for c in p_hand]
                for m in range(1, 13):
                    if hand_months.count(m) == 4:
                        chongtong_winner_ws = p_ws
                        room['chat_logs'].append({'system': True, 'text': f"👑 [{room['players'][p_ws]['nickname']}]님이 손패에 {m}월 4장(총통)을 모아 즉시 승리하셨습니다!"})
                        break

            room['deck'] = deck
            room['table_cards'] = table_cards

            if chongtong_winner_ws:
                room['players'][chongtong_winner_ws]['score'] = 10
                await finalize_gostop_game(room, chongtong_winner_ws)
                return current_room_id

            room['chat_logs'].append({'system': True, 'text': f"🎴 대국 시작! (손패 {hand_count}장, 바닥 {table_count}장)"})

        room['turn_start_time'] = time.time()
        turn_order_list = [{'rank': idx + 1, 'nickname': room['players'][s]['nickname'], 'color': room['players'][s]['color']} for idx, s in enumerate(room['turn_order'])]
        await broadcast_to_room(current_room_id, {'type': 'STARTING_DRAW', 'turn_order_list': turn_order_list, 'state': None})

    elif msg_type == 'SUBMIT_TURN':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'RUMMIKUB' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                player = room['players'][ws]
                new_rack = data.get('rack', [])
                new_table = data.get('table_sets', [])

                # 타일을 내려놓았는지 판단
                is_tile_placed = len(new_rack) < len(player.get('rack', []))

                # 첫 등록 검증 (서버 차단 로직)
                if not player.get('has_opened', False) and is_tile_placed:
                    rule_type = room.get('rule_type', 'official')

                    def get_set_score(s):
                        non_jokers = [t for t in s if not t.get('is_joker')]
                        if not non_jokers: return 0
                        is_group = all(t['number'] == non_jokers[0]['number'] for t in non_jokers)
                        if is_group: return non_jokers[0]['number'] * len(s)
                        return sum(t['number'] for t in non_jokers)

                    if rule_type == 'jaehee':
                        # 단일 세트 합이 30을 초과(> 30)하는지 확인
                        has_valid_single_set = any(get_set_score(s) > 30 for s in new_table)
                        if not has_valid_single_set:
                            err_msg = {'type': 'ERROR', 'message': '[재히룰] 첫 등록은 한 세트의 합이 30을 넘어야 합니다.'}
                            if hasattr(ws, 'send_json'): await ws.send_json(err_msg)
                            else: await ws.send(json.dumps(err_msg, ensure_ascii=False))
                            return current_room_id
                    
                    player['has_opened'] = True

                if len(new_rack) >= len(player.get('rack', [])) and room['deck']:
                    drawn_tile = room['deck'].pop()
                    new_rack.append(drawn_tile)
                    room['chat_logs'].append({'system': True, 'text': f"🃏 [{player['nickname']}]님이 타일 1장을 가져왔습니다."})
                else:
                    room['chat_logs'].append({'system': True, 'text': f"🧩 [{player['nickname']}]님이 타일 조합을 냈습니다."})

                player['rack'] = new_rack
                room['table_sets'] = new_table

                if len(new_rack) == 0:
                    player['wins'] = player.get('wins', 0) + 1
                    winner_name = str(player['nickname']).strip()
                    
                    room['chat_logs'].append({'system': True, 'text': f"🏆 축하합니다! [{winner_name}]님이 모든 타일을 털어 최종 우승하셨습니다!"})
                    
                    # 1. 우승자의 닉네임을 명확히 보장하여 GAME_OVER 이벤트 브로드캐스트
                    await broadcast_to_room(current_room_id, {
                        'type': 'GAME_OVER', 
                        'winner_name': winner_name, 
                        'winner_id': str(player['id']), 
                        'state': serialize_room_state(current_room_id)
                    })
                    # 2. DB 기록 및 캐시 갱신은 백그라운드 태스크로 연동 (응답 속도 향상)
                    async def save_win_async(name):
                        await asyncio.to_thread(record_daily_win, 'RUMMIKUB', name)
                        top_winner = await asyncio.to_thread(get_today_top_winner, 'RUMMIKUB')
                        if top_winner:
                            TODAY_KING_CACHE['RUMMIKUB'] = top_winner

                    asyncio.create_task(save_win_async(winner_name))

                    async def reset_to_waiting_after_delay():
                        await asyncio.sleep(4)
                        room['status'] = 'WAITING'
                        room['table_sets'] = []
                        for p in room['players'].values():
                            p['rack'] = []
                            p['is_ready'] = False
                        await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

                    asyncio.create_task(reset_to_waiting_after_delay())
                else:
                    room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
                    room['turn_start_time'] = time.time()
                    await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'START_ROUND':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'SEOTDA' and room['status'] == 'SHOWDOWN':
            if ws == room.get('dealer_ws'):
                room['status'] = 'PLAYING'
                start_seotda_round(room)
                room['turn_start_time'] = time.time()
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'SEOTDA_BET':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'SEOTDA' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                action = data.get('action')
                player = room['players'][ws]
                base_ante = room.get('base_ante', 100)
                
                active_players = [p for p in room['players'].values() if not p['is_folded']]
                max_table_bet = max(p['current_bet'] for p in active_players) if active_players else player['current_bet']
                call_amount = max(0, max_table_bet - player['current_bet'])

                bet_add = 0
                if action == 'DIE':
                    player['is_folded'] = True
                    room['chat_logs'].append({'system': True, 'text': f"😭 [{player['nickname']}]님이 다이(기권)하셨습니다."})
                else:
                    if action == 'CALL':
                        bet_add = call_amount
                    elif action == 'BING':
                        bet_add = call_amount + base_ante
                        room['last_raise_amount'] = base_ante
                    elif action == 'TADANG':
                        raise_amt = max(base_ante, room.get('last_raise_amount', base_ante) * 2)
                        bet_add = call_amount + raise_amt
                        room['last_raise_amount'] = raise_amt
                    elif action == 'HALF':
                        raise_amt = max(base_ante, int((room['pot'] + call_amount) * 0.5))
                        bet_add = call_amount + raise_amt
                        room['last_raise_amount'] = raise_amt

                    bet_add = min(player['chips'], max(bet_add, 0))
                    player['chips'] -= bet_add
                    player['current_bet'] += bet_add
                    room['pot'] += bet_add
                    
                    action_korean = {'CALL': '콜', 'BING': '삥', 'TADANG': '따당', 'HALF': '하프'}.get(action, action)
                    is_allin = (player['chips'] == 0)
                    allin_str = " (올인!!)" if is_allin else ""
                    room['chat_logs'].append({'system': True, 'text': f"💸 [{player['nickname']}]님이 [{action_korean}]{allin_str} ({bet_add}칩 추가배팅)!"})

                room['betting_turns'] = room.get('betting_turns', 0) + 1
                active_ws = [p_ws for p_ws, p in room['players'].items() if not p['is_folded']]
                
                if len(active_ws) == 1:
                    winner_ws = active_ws[0]
                    winner = room['players'][winner_ws]
                    winner['chips'] += room['pot']
                    room['dealer_ws'] = winner_ws
                    for p in room['players'].values():
                        asyncio.create_task(asyncio.to_thread(save_user_chips_to_db, p['nickname'], p['chips']))
                    room['chat_logs'].append({'system': True, 'text': f"🎉 모두 기권하여 [{winner['nickname']}]님이 {room['pot']} 칩을 획득했습니다!"})
                    room['status'] = 'SHOWDOWN'
                else:
                    highest_bet = max(room['players'][aw]['current_bet'] for aw in active_ws)
                    all_bets_settled = all(
                        (room['players'][aw]['current_bet'] == highest_bet or room['players'][aw]['chips'] == 0)
                        for aw in active_ws
                    )
                    can_bet_players = [aw for aw in active_ws if room['players'][aw]['chips'] > 0]

                    if all_bets_settled and (len(can_bet_players) <= 1 or room['betting_turns'] >= len(active_ws)):
                        active_players_info = [(aw, room['players'][aw]) for aw in active_ws]
                        active_players_info.sort(key=lambda x: x[1]['jokbo_score'], reverse=True)
                        winner_ws, winner = active_players_info[0]
                        winner['chips'] += room['pot']
                        room['dealer_ws'] = winner_ws
                        for p in room['players'].values():
                            asyncio.create_task(asyncio.to_thread(save_user_chips_to_db, p['nickname'], p['chips']))
                        room['chat_logs'].append({'system': True, 'text': f"🏆 쪼기 결과! [{winner['nickname']}]님이 '{winner['jokbo_name']}'(으)로 {room['pot']} 칩 획득!"})
                        room['status'] = 'SHOWDOWN'
                    else:
                        next_idx = (room['current_turn_index'] + 1) % len(room['turn_order'])
                        for _ in range(len(room['turn_order'])):
                            candidate_ws = room['turn_order'][next_idx]
                            candidate_p = room['players'][candidate_ws]
                            if not candidate_p['is_folded'] and candidate_p['chips'] > 0: break
                            next_idx = (next_idx + 1) % len(room['turn_order'])

                        room['current_turn_index'] = next_idx
                        room['turn_start_time'] = time.time()

                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'TOGGLE_READY':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players']:
            p = room['players'][ws]
            p['is_ready'] = not p.get('is_ready', False)
            status_str = "준비 완료" if p['is_ready'] else "준비 취소"
            room['chat_logs'].append({'system': True, 'text': f"✋ [{p['nickname']}]님이 {status_str}하셨습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'RESET_GAME':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players'] and room['players'][ws]['is_host']:
            room['status'] = 'WAITING'
            keep_board = data.get('keep_board', False)

            if room['game_type'] == 'BINGO':
                for p in room['players'].values():
                    p['marked'] = set()
                    p['score'] = 0
                    p['is_ready'] = False
                    if not keep_board:
                        p['board'] = generate_player_board(room['config'].get('word_pool', []), room['config']['size'])

            elif room['game_type'] == 'RUMMIKUB':
                room['deck'] = []
                room['table_sets'] = []
                for p in room['players'].values():
                    p['rack'] = []
                    p['is_ready'] = False

            elif room['game_type'] == 'SEOTDA':
                room['pot'] = 0
                for p in room['players'].values():
                    p['hand'] = []
                    p['is_ready'] = False

            room['chat_logs'].append({'system': True, 'text': "🔄 방장에 의해 대기실 상태로 리셋되었습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'CHAT_MESSAGE':
        room = ROOMS.get(current_room_id)
        if room:
            p = room['players'].get(ws)
            text = str(data.get('message', '')).strip()
            if text:
                msg_obj = {'system': False, 'nickname': p['nickname'] if p else '익명', 'color': p['color'] if p else '#ccc', 'text': text}
                room['chat_logs'].append(msg_obj)
                await broadcast_to_room(current_room_id, {'type': 'CHAT_MESSAGE', 'chat': msg_obj})

    return current_room_id

async def finish_gostop_turn(room, current_room_id):
    room['drawn_card'] = None
    current_ws = room['turn_order'][room['current_turn_index']]
    player = room['players'][current_ws]

    opps = [p for w, p in room['players'].items() if w != current_ws and not p.get('is_spectator')]
    is_two = (len(opps) == 1)
    
    calc = calculate_gostop_score(player, opps, is_two)
    player['score'] = calc['final_score']
    last_go_score = player.get('last_go_score', 0)

    if player['score'] >= 3 and player['score'] > last_go_score:
        room['turn_phase'] = 'DECIDE_GO_STOP'
        room['turn_start_time'] = time.time()
        await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return

    if not any(p['hand'] for p in room['players'].values() if not p.get('is_spectator', False)):
        await finalize_gostop_game(room, current_ws)
    else:
        room['turn_phase'] = 'PLAY_HAND'
        room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
        room['turn_start_time'] = time.time()
        await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

async def finalize_gostop_game(room, winner_ws):
    point_chip = room.get('point_chip', 100)
    winner = room['players'][winner_ws]
    winner_nickname = winner['nickname']
    
    opponents = [p for w, p in room['players'].items() if w != winner_ws and not p.get('is_spectator')]
    is_two_player = (len(opponents) == 1)
    
    calc = calculate_gostop_score(winner, opponents, is_two_player)
    final_pts = calc['final_score']
    
    room['chat_logs'].append({'system': True, 'text': f"🏆 대국 종료! 최종 승자 [{winner_nickname}] (총 {final_pts}점 달성)"})
    if calc['score_breakdown']:
        room['chat_logs'].append({'system': True, 'text': f"📊 족보: {', '.join(calc['score_breakdown'])}"})

    total_won_chips = 0
    for ws, p in room['players'].items():
        if ws != winner_ws and not p.get('is_spectator'):
            p_mult = calc['penalty_multipliers'].get(p['id'], 1)
            pay_chips = final_pts * point_chip * p_mult
            
            actual_paid = min(p['chips'], pay_chips)
            p['chips'] -= actual_paid
            total_won_chips += actual_paid
            asyncio.create_task(asyncio.to_thread(save_user_chips_to_db, p['nickname'], p['chips']))

    winner['chips'] += total_won_chips
    asyncio.create_task(asyncio.to_thread(save_user_chips_to_db, winner['nickname'], winner['chips']))

    room['status'] = 'WAITING'
    await broadcast_to_room(room['room_id'], {'type': 'ROOM_UPDATED', 'state': None})

try:
    from aiohttp import web
    async def aiohttp_ws_handler(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        current_room_id = None
        current_player_id = str(id(ws))
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    current_room_id = await process_client_msg(ws, current_player_id, data, current_room_id)
        finally:
            if current_room_id and current_room_id in ROOMS:
                room = ROOMS[current_room_id]
                if ws in room['players']:
                    room['players'].pop(ws)
                    if ws in room['turn_order']: room['turn_order'].remove(ws)
                    if not room['players']: del ROOMS[current_room_id]
                    else:
                        if room['turn_order']: room['current_turn_index'] = room['current_turn_index'] % len(room['turn_order'])
                        await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return ws

    async def handle_static_files(request):
        path = request.path
        file_path = os.path.join(PUBLIC_DIR, 'index.html') if path in ('/', '/index.html') else os.path.join(PUBLIC_DIR, path.lstrip('/'))
        if os.path.exists(file_path) and os.path.isfile(file_path): return web.FileResponse(file_path)
        return web.FileResponse(os.path.join(PUBLIC_DIR, 'index.html'))

    def run_aiohttp_server():
        print(f" [INFO] Office Games Live Server running on port {PORT}")
        app = web.Application()
        app.on_startup.append(start_background_tasks)
        app.on_cleanup.append(cleanup_background_tasks)
        app.router.add_get('/ws', aiohttp_ws_handler)
        app.router.add_get('/{tail:.*}', handle_static_files)
        web.run_app(app, host='0.0.0.0', port=PORT)

    if __name__ == '__main__':
        run_aiohttp_server()
except ImportError:
    print("[ERROR] aiohttp module is required.")
