#!/usr/bin/env python3
"""
Office Bingo Live Unified Server (HTTP + WebSockets)
Supports single $PORT hosting on Render.com, Heroku, Railway, and Localhost.
Serves static files (index.html, style.css, app.js, presets.js) AND handles WebSockets.
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

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = int(os.environ.get("PORT", 8000))
PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))
TURN_DURATION_SECONDS = 15

AVATAR_COLORS = [
    "#FF5733", "#33FF57", "#3357FF", "#F39C12", "#8E44AD",
    "#1ABC9C", "#E91E63", "#00BCD4", "#8BC34A", "#FF9800"
]

ROOMS = {}


def generate_room_code(length=6):
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choice(chars) for _ in range(length))
        if code not in ROOMS:
            return code


def calculate_bingo_lines(board, marked_indices, size):
    if not board or len(board) < size * size:
        return 0

    marked_set = set(marked_indices)
    lines = 0

    for r in range(size):
        if all((r * size + c) in marked_set for c in range(size)):
            lines += 1

    for c in range(size):
        if all((r * size + c) in marked_set for r in range(size)):
            lines += 1

    if all((i * size + i) in marked_set for i in range(size)):
        lines += 1

    if all((i * size + (size - 1 - i)) in marked_set for i in range(size)):
        lines += 1

    return lines


def generate_player_board(word_pool, size):
    total_cells = size * size
    words = list(word_pool) if word_pool else []

    if len(words) < total_cells:
        extra_needed = total_cells - len(words)
        for i in range(1, extra_needed + 1):
            words.append(f"단어 {i}")

    return random.sample(words, len(words))[:total_cells]


def get_current_turn_player(room):
    if not room or room['status'] != 'PLAYING' or not room['turn_order']:
        return None, None
    
    idx = room['current_turn_index'] % len(room['turn_order'])
    current_ws = room['turn_order'][idx]
    player = room['players'].get(current_ws)
    return current_ws, player


def serialize_room_state(room_id):
    if room_id not in ROOMS:
        return None

    room = ROOMS[room_id]
    players_data = []

    current_ws, current_player = get_current_turn_player(room)
    current_turn_player_id = current_player['id'] if current_player else None

    time_left = 0
    if room['status'] == 'PLAYING' and room.get('turn_start_time'):
        elapsed = int(time.time() - room['turn_start_time'])
        time_left = max(0, TURN_DURATION_SECONDS - elapsed)

    for ws, player in room['players'].items():
        players_data.append({
            'player_id': player['id'],
            'nickname': player['nickname'],
            'is_host': player['is_host'],
            'is_ready': player['is_ready'],
            'is_escaped': player.get('is_escaped', False),
            'escape_rank': player.get('escape_rank', 0),
            'is_loser': player.get('is_loser', False),
            'is_current_turn': (player['id'] == current_turn_player_id),
            'color': player['color'],
            'score': player['score'],
            'marked_count': len(player['marked']),
            'board': player['board'],
            'marked': list(player['marked'])
        })

    return {
        'room_id': room_id,
        'status': room['status'],
        'config': room['config'],
        'called_items': room['called_items'],
        'current_turn_player_id': current_turn_player_id,
        'turn_time_remaining': time_left,
        'players': players_data,
        'chat_logs': room['chat_logs'][-30:]
    }


async def broadcast_to_room(room_id, message_dict):
    if room_id not in ROOMS:
        return
    
    target_sockets = list(ROOMS[room_id]['players'].keys())
    
    for ws in target_sockets:
        try:
            if hasattr(ws, 'send_json'):
                await ws.send_json(message_dict)
            else:
                await ws.send(json.dumps(message_dict, ensure_ascii=False))
        except Exception:
            pass


def start_turn_timer(room_id):
    if room_id not in ROOMS:
        return

    room = ROOMS[room_id]
    if room.get('timer_task'):
        room['timer_task'].cancel()

    room['turn_start_time'] = time.time()
    room['timer_task'] = asyncio.create_task(run_turn_timer(room_id, room['turn_step']))


async def run_turn_timer(room_id, expected_step):
    try:
        await asyncio.sleep(TURN_DURATION_SECONDS)
        if room_id not in ROOMS:
            return

        room = ROOMS[room_id]
        if room['status'] != 'PLAYING' or room['turn_step'] != expected_step:
            return

        current_ws, player = get_current_turn_player(room)
        if not player:
            return

        uncalled_words = [cell for cell in player['board'] if cell and cell not in room['called_items']]
        
        chosen_word = None
        if uncalled_words:
            chosen_word = random.choice(uncalled_words)
        else:
            pool_uncalled = [w for w in room['config']['word_pool'] if w not in room['called_items']]
            if pool_uncalled:
                chosen_word = random.choice(pool_uncalled)

        if chosen_word:
            sys_msg = f"⏰ 시간 초과! [{player['nickname']}]님의 턴에 무작위로 [{chosen_word}] (이)가 선택되었습니다."
            room['chat_logs'].append({'system': True, 'text': sys_msg})
            await execute_word_call(room_id, chosen_word, player['nickname'])
        else:
            advance_turn(room_id)
            await broadcast_to_room(room_id, {
                'type': 'ROOM_UPDATED',
                'state': serialize_room_state(room_id)
            })

    except asyncio.CancelledError:
        pass


def advance_turn(room_id):
    if room_id not in ROOMS:
        return
    
    room = ROOMS[room_id]
    if not room['turn_order']:
        return

    num_players = len(room['turn_order'])
    for _ in range(num_players):
        room['current_turn_index'] = (room['current_turn_index'] + 1) % num_players
        current_ws = room['turn_order'][room['current_turn_index']]
        p = room['players'].get(current_ws)
        if p and not p.get('is_escaped', False):
            break

    room['turn_step'] += 1
    start_turn_timer(room_id)


async def execute_word_call(room_id, word_text, caller_nickname):
    if room_id not in ROOMS:
        return

    room = ROOMS[room_id]
    if word_text in room['called_items']:
        return

    room['called_items'].append(word_text)
    size = room['config']['size']
    game_mode = room['config'].get('game_mode', 'WINNER')

    for ws, p in room['players'].items():
        prev_score = p['score']
        for idx, val in enumerate(p['board']):
            if val == word_text:
                p['marked'].add(idx)
        
        new_score = calculate_bingo_lines(p['board'], p['marked'], size)
        p['score'] = new_score

        if new_score > prev_score:
            sys_msg = f"🎊 '{p['nickname']}'님이 {new_score}줄 빙고를 달성했습니다!"
            room['chat_logs'].append({'system': True, 'text': sys_msg})

            if game_mode == 'WINNER':
                if new_score >= size:
                    sys_msg_win = f"🏆 짝짝짝! '{p['nickname']}'님이 {new_score}줄을 달성하여 1등 승리자가 되었습니다! 🎉"
                    room['chat_logs'].append({'system': True, 'text': sys_msg_win})
            else:
                if new_score >= size and not p.get('is_escaped', False):
                    p['is_escaped'] = True
                    escaped_count = sum(1 for pl in room['players'].values() if pl.get('is_escaped'))
                    p['escape_rank'] = escaped_count
                    sys_msg_esc = f"🟢 '{p['nickname']}'님이 {new_score}줄 완성으로 안전하게 탈출했습니다! ({escaped_count}등 탈출)"
                    room['chat_logs'].append({'system': True, 'text': sys_msg_esc})

    if game_mode == 'LOSER':
        un_escaped = [pl for pl in room['players'].values() if not pl.get('is_escaped')]
        if len(room['players']) > 1 and len(un_escaped) == 1:
            loser_player = un_escaped[0]
            loser_player['is_loser'] = True
            sys_msg_lose = f"💣 아아... '{loser_player['nickname']}'님이 마지막까지 탈출하지 못하여 최종 패자(벌칙 당첨자)가 되었습니다! 😭"
            room['chat_logs'].append({'system': True, 'text': sys_msg_lose})

    sys_msg = f"📢 '{caller_nickname}'님이 [{word_text}] (을)를 선택하여 모두의 보드에서 지워졌습니다!"
    room['chat_logs'].append({'system': True, 'text': sys_msg})

    advance_turn(room_id)

    await broadcast_to_room(room_id, {
        'type': 'PLAYER_MARKED',
        'word': word_text,
        'caller': caller_nickname,
        'state': serialize_room_state(room_id)
    })


async def process_client_msg(ws, current_player_id, data, current_room_id):
    msg_type = data.get('type')

    if msg_type == 'CREATE_ROOM':
        nickname = data.get('nickname', '방장').strip() or '방장'
        size = int(data.get('size', 5))
        if size not in (3, 4, 5): size = 5
        
        topic = data.get('topic', '자유 주제').strip() or '자유 주제'
        game_mode = data.get('game_mode', 'WINNER')
        word_pool = data.get('word_pool', [])

        room_id = generate_room_code()
        board = generate_player_board(word_pool, size)
        color = random.choice(AVATAR_COLORS)

        ROOMS[room_id] = {
            'status': 'WAITING',
            'config': {
                'size': size,
                'topic': topic,
                'game_mode': game_mode,
                'word_pool': word_pool,
                'target_lines': size
            },
            'players': {
                ws: {
                    'id': current_player_id,
                    'nickname': nickname,
                    'is_host': True,
                    'is_ready': False,
                    'is_escaped': False,
                    'escape_rank': 0,
                    'is_loser': False,
                    'color': color,
                    'board': board,
                    'marked': set(),
                    'score': 0
                }
            },
            'turn_order': [],
            'current_turn_index': 0,
            'turn_step': 0,
            'turn_start_time': None,
            'timer_task': None,
            'called_items': [],
            'chat_logs': []
        }

        current_room_id = room_id

        res = {
            'type': 'ROOM_JOINED',
            'room_id': room_id,
            'player_id': current_player_id,
            'is_host': True,
            'state': serialize_room_state(room_id)
        }
        if hasattr(ws, 'send_json'):
            await ws.send_json(res)
        else:
            await ws.send(json.dumps(res, ensure_ascii=False))

    elif msg_type == 'JOIN_ROOM':
        room_id = data.get('room_id', '').upper().strip()
        nickname = data.get('nickname', '참여자').strip() or '참여자'

        if room_id not in ROOMS:
            err_msg = {'type': 'ERROR', 'message': '존재하지 않는 방 코드입니다.'}
            if hasattr(ws, 'send_json'): await ws.send_json(err_msg)
            else: await ws.send(json.dumps(err_msg, ensure_ascii=False))
            return current_room_id

        room = ROOMS[room_id]
        size = room['config']['size']
        word_pool = room['config']['word_pool']

        board = generate_player_board(word_pool, size)
        color = random.choice(AVATAR_COLORS)

        room['players'][ws] = {
            'id': current_player_id,
            'nickname': nickname,
            'is_host': False,
            'is_ready': False,
            'is_escaped': False,
            'escape_rank': 0,
            'is_loser': False,
            'color': color,
            'board': board,
            'marked': set(),
            'score': 0
        }

        current_room_id = room_id

        sys_msg = f"🎉 '{nickname}'님이 방에 입장하였습니다."
        room['chat_logs'].append({'system': True, 'text': sys_msg})

        res = {
            'type': 'ROOM_JOINED',
            'room_id': room_id,
            'player_id': current_player_id,
            'is_host': False,
            'state': serialize_room_state(room_id)
        }
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))

        await broadcast_to_room(room_id, {
            'type': 'ROOM_UPDATED',
            'state': serialize_room_state(room_id)
        })

    elif msg_type == 'UPDATE_CELL_TEXT':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        if not player: return current_room_id
        cell_index = data.get('cell_index')
        new_text = str(data.get('text', '')).strip()

        if cell_index is not None and 0 <= cell_index < len(player['board']):
            player['board'][cell_index] = new_text
            player['is_ready'] = False
            await broadcast_to_room(current_room_id, {
                'type': 'ROOM_UPDATED',
                'state': serialize_room_state(current_room_id)
            })

    elif msg_type == 'UPDATE_BOARD':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        if not player: return current_room_id

        new_board = data.get('board', [])
        size = room['config']['size']
        if len(new_board) == size * size:
            player['board'] = [str(cell).strip() for cell in new_board]
            player['is_ready'] = False
            await broadcast_to_room(current_room_id, {
                'type': 'ROOM_UPDATED',
                'state': serialize_room_state(current_room_id)
            })

    elif msg_type == 'TOGGLE_READY':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        if not player: return current_room_id

        empty_cells = [cell for cell in player['board'] if not cell.strip()]
        if empty_cells and not player['is_ready']:
            err_msg = {'type': 'ERROR', 'message': '빈 칸이 있습니다! 모든 칸을 채운 뒤 준비 완료를 눌러주세요.'}
            if hasattr(ws, 'send_json'): await ws.send_json(err_msg)
            else: await ws.send(json.dumps(err_msg, ensure_ascii=False))
            return current_room_id

        player['is_ready'] = not player['is_ready']
        status_str = "준비 완료" if player['is_ready'] else "준비 해제"
        sys_msg = f"✋ '{player['nickname']}'님이 {status_str} 하셨습니다."
        room['chat_logs'].append({'system': True, 'text': sys_msg})

        await broadcast_to_room(current_room_id, {
            'type': 'ROOM_UPDATED',
            'state': serialize_room_state(current_room_id)
        })

    elif msg_type == 'START_GAME':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        if not player or not player['is_host']: return current_room_id

        room['status'] = 'PLAYING'
        room['called_items'] = []
        
        player_sockets = list(room['players'].keys())
        random.shuffle(player_sockets)
        room['turn_order'] = player_sockets
        room['current_turn_index'] = 0
        room['turn_step'] = 0

        for socket_key, p in room['players'].items():
            p['marked'] = set()
            p['score'] = 0
            p['is_escaped'] = False
            p['escape_rank'] = 0
            p['is_loser'] = False

        first_ws, first_player = get_current_turn_player(room)
        first_name = first_player['nickname'] if first_player else ''

        turn_order_list = []
        for idx, socket_key in enumerate(player_sockets):
            p = room['players'][socket_key]
            turn_order_list.append({
                'rank': idx + 1,
                'nickname': p['nickname'],
                'color': p['color']
            })

        sys_msg = f"🎲 턴 순서 제비뽑기가 완료되었습니다! 첫 턴: [{first_name}]님"
        room['chat_logs'].append({'system': True, 'text': sys_msg})

        start_turn_timer(current_room_id)

        await broadcast_to_room(current_room_id, {
            'type': 'STARTING_DRAW',
            'turn_order_list': turn_order_list,
            'state': serialize_room_state(current_room_id)
        })

    elif msg_type == 'MARK_CELL':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        if room['status'] != 'PLAYING': return current_room_id

        current_ws, turn_player = get_current_turn_player(room)
        if ws != current_ws:
            err_msg = {'type': 'ERROR', 'message': f"아직 내 턴이 아닙니다! (현재 턴: {turn_player['nickname']}님)"}
            if hasattr(ws, 'send_json'): await ws.send_json(err_msg)
            else: await ws.send(json.dumps(err_msg, ensure_ascii=False))
            return current_room_id

        cell_index = data.get('cell_index')
        if cell_index is None or not (0 <= cell_index < len(turn_player['board'])): return current_room_id

        word_text = turn_player['board'][cell_index].strip()
        if not word_text or word_text in room['called_items']:
            err_msg = {'type': 'ERROR', 'message': '이미 호출되었거나 빈 칸입니다.'}
            if hasattr(ws, 'send_json'): await ws.send_json(err_msg)
            else: await ws.send(json.dumps(err_msg, ensure_ascii=False))
            return current_room_id

        await execute_word_call(current_room_id, word_text, turn_player['nickname'])

    elif msg_type == 'RESET_GAME':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        if not player or not player['is_host']: return current_room_id

        size = room['config']['size']
        word_pool = room['config']['word_pool']
        
        if room.get('timer_task'): room['timer_task'].cancel()

        room['status'] = 'WAITING'
        room['called_items'] = []
        room['turn_order'] = []
        room['current_turn_index'] = 0

        for socket_key, p in room['players'].items():
            p['board'] = generate_player_board(word_pool, size)
            p['marked'] = set()
            p['score'] = 0
            p['is_ready'] = False
            p['is_escaped'] = False
            p['escape_rank'] = 0
            p['is_loser'] = False

        sys_msg = "🔄 방장이 대기실로 리셋했습니다."
        room['chat_logs'].append({'system': True, 'text': sys_msg})

        await broadcast_to_room(current_room_id, {
            'type': 'ROOM_UPDATED',
            'state': serialize_room_state(current_room_id)
        })

    elif msg_type == 'CHAT_MESSAGE':
        if not current_room_id or current_room_id not in ROOMS: return current_room_id
        room = ROOMS[current_room_id]
        player = room['players'].get(ws)
        chat_text = data.get('message', '').strip()

        if chat_text:
            msg_obj = {
                'system': False,
                'nickname': player['nickname'] if player else '익명',
                'color': player['color'] if player else '#ccc',
                'text': chat_text
            }
            room['chat_logs'].append(msg_obj)
            await broadcast_to_room(current_room_id, {
                'type': 'CHAT_MESSAGE',
                'chat': msg_obj
            })

    return current_room_id


# --- Try aiohttp implementation ---
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
                    try:
                        data = json.loads(msg.data)
                        current_room_id = await process_client_msg(ws, current_player_id, data, current_room_id)
                    except json.JSONDecodeError:
                        pass
        finally:
            if current_room_id and current_room_id in ROOMS:
                room = ROOMS[current_room_id]
                if ws in room['players']:
                    p = room['players'].pop(ws)
                    disc_msg = f"🚪 '{p['nickname']}'님이 퇴장하셨습니다."
                    room['chat_logs'].append({'system': True, 'text': disc_msg})

                    if ws in room['turn_order']:
                        room['turn_order'].remove(ws)

                    if not room['players']:
                        if room.get('timer_task'): room['timer_task'].cancel()
                        del ROOMS[current_room_id]
                    else:
                        if p['is_host']:
                            first_ws = next(iter(room['players'].keys()))
                            room['players'][first_ws]['is_host'] = True
                            new_host_name = room['players'][first_ws]['nickname']
                            room['chat_logs'].append({
                                'system': True,
                                'text': f"👑 '{new_host_name}'님이 새로운 방장이 되었습니다."
                            })

                        await broadcast_to_room(current_room_id, {
                            'type': 'ROOM_UPDATED',
                            'state': serialize_room_state(current_room_id)
                        })
        return ws

    async def handle_static_files(request):
        path = request.path
        if path in ('/', '/index.html'):
            file_path = os.path.join(PUBLIC_DIR, 'index.html')
        else:
            file_path = os.path.join(PUBLIC_DIR, path.lstrip('/'))

        if os.path.exists(file_path) and os.path.isfile(file_path):
            return web.FileResponse(file_path)
        return web.FileResponse(os.path.join(PUBLIC_DIR, 'index.html'))

    def run_aiohttp_server():
        print(f"===============================================================")
        print(f" [INFO] Office Bingo Live Server running on port {PORT} via aiohttp")
        print(f" [HTTP/WS] Serving static files & WebSockets on single port!")
        print(f"===============================================================")
        app = web.Application()
        app.router.add_get('/ws', aiohttp_ws_handler)
        app.router.add_get('/{tail:.*}', handle_static_files)
        web.run_app(app, host='0.0.0.0', port=PORT)

    if __name__ == '__main__':
        run_aiohttp_server()

except ImportError:
    import websockets

    async def websockets_handler(websocket):
        current_room_id = None
        current_player_id = str(id(websocket))

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    current_room_id = await process_client_msg(websocket, current_player_id, data, current_room_id)
                except json.JSONDecodeError:
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            if current_room_id and current_room_id in ROOMS:
                room = ROOMS[current_room_id]
                if websocket in room['players']:
                    p = room['players'].pop(websocket)
                    disc_msg = f"🚪 '{p['nickname']}'님이 퇴장하셨습니다."
                    room['chat_logs'].append({'system': True, 'text': disc_msg})

                    if websocket in room['turn_order']:
                        room['turn_order'].remove(websocket)

                    if not room['players']:
                        if room.get('timer_task'): room['timer_task'].cancel()
                        del ROOMS[current_room_id]
                    else:
                        if p['is_host']:
                            first_ws = next(iter(room['players'].keys()))
                            room['players'][first_ws]['is_host'] = True
                            new_host_name = room['players'][first_ws]['nickname']
                            room['chat_logs'].append({
                                'system': True,
                                'text': f"👑 '{new_host_name}'님이 새로운 방장이 되었습니다."
                            })

                        await broadcast_to_room(current_room_id, {
                            'type': 'ROOM_UPDATED',
                            'state': serialize_room_state(current_room_id)
                        })

    async def universal_process_request(arg1, arg2=None):
        try:
            if hasattr(arg2, 'path'):
                path = arg2.path
                headers = arg2.headers
                connection = arg1
            elif hasattr(arg1, 'path'):
                path = arg1.path
                headers = getattr(arg1, 'headers', {})
                connection = None
            else:
                path = str(arg1)
                headers = arg2 or {}
                connection = None

            conn_hdr = ""
            if hasattr(headers, 'get'):
                conn_hdr = headers.get("Connection", "").lower()
            elif isinstance(headers, (list, tuple)):
                for k, v in headers:
                    if k.lower() == 'connection':
                        conn_hdr = v.lower()
                        break

            if "upgrade" in str(conn_hdr):
                return None

            clean_path = path.split('?')[0]
            if clean_path in ('/', '/index.html'):
                file_path = os.path.join(PUBLIC_DIR, 'index.html')
            else:
                file_path = os.path.join(PUBLIC_DIR, clean_path.lstrip('/'))

            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                file_path = os.path.join(PUBLIC_DIR, 'index.html')

            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type: mime_type = 'text/html'
            with open(file_path, 'rb') as f:
                content = f.read()

            try:
                from websockets.http11 import Response as WSResponse
                from websockets.datastructures import Headers as WSHeaders
                hdr_type = f"{mime_type}; charset=utf-8" if ("text" in mime_type or "javascript" in mime_type) else mime_type
                res_hdrs = WSHeaders([
                    ("Content-Type", hdr_type),
                    ("Content-Length", str(len(content))),
                    ("Access-Control-Allow-Origin", "*")
                ])
                return WSResponse(200, "OK", res_hdrs, content)
            except Exception:
                pass

            response_headers = [
                ("Content-Type", f"{mime_type}; charset=utf-8" if ("text" in mime_type or "javascript" in mime_type) else mime_type),
                ("Content-Length", str(len(content))),
                ("Access-Control-Allow-Origin", "*")
            ]
            return (http.HTTPStatus.OK, response_headers, content)

        except Exception:
            with open(os.path.join(PUBLIC_DIR, 'index.html'), 'rb') as f:
                content = f.read()
            try:
                from websockets.http11 import Response as WSResponse
                from websockets.datastructures import Headers as WSHeaders
                return WSResponse(200, "OK", WSHeaders([("Content-Type", "text/html; charset=utf-8")]), content)
            except Exception:
                return (http.HTTPStatus.OK, [("Content-Type", "text/html; charset=utf-8")], content)

    async def main_fallback():
        print(f"===============================================================")
        print(f" [INFO] Office Bingo Live Fallback Server running on port {PORT}")
        print(f"===============================================================")
        async with websockets.serve(websockets_handler, "0.0.0.0", PORT, process_request=universal_process_request):
            await asyncio.Future()

    if __name__ == '__main__':
        asyncio.run(main_fallback())
