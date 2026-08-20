"""
dokseong 미리보기용 개발 서버.

평범한 http.server와 다른 점 두 가지:
  1. 캐시를 끈다 — 브라우저가 예전 HTML을 붙들고 있어 수정이 안 보이는 걸 막는다.
  2. HTML을 내려줄 때 자동 새로고침 스크립트를 끼워 넣는다.
     파일이 바뀌면 브라우저가 알아서 새로고침한다. (저장소 파일은 건드리지 않는다)

  python tools/preview.py

기본값은 public/ 폴더와 8321 포트입니다.
  python tools/preview.py public 8321   처럼 직접 지정할 수도 있습니다.
"""
import http.server
import json
import os
import socketserver
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'public')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8321

RELOAD_JS = """
<script>
/* 개발용 자동 새로고침. 배포본에는 들어가지 않습니다(서버가 끼워 넣는 것). */
(function () {
  var last = null;
  setInterval(function () {
    fetch('/__ver', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (last === null) { last = d.v; return; }
        if (d.v !== last) location.reload();
      })
      .catch(function () {});
  }, 800);
})();
</script>
"""


def version():
    """public/ 안 파일들의 가장 최근 수정 시각 + 개수."""
    newest = 0.0
    count = 0
    for base, _dirs, files in os.walk(ROOT):
        for f in files:
            try:
                newest = max(newest, os.path.getmtime(os.path.join(base, f)))
                count += 1
            except OSError:
                pass
    return f'{newest:.3f}-{count}'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass  # 조용히

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/__ver'):
            body = json.dumps({'v': version()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # HTML이면 자동 새로고침 스크립트를 끼워서 내려준다
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if path.endswith('.html') and os.path.isfile(path):
            with open(path, 'rb') as fp:
                body = fp.read()
            if b'</body>' in body:
                body = body.replace(b'</body>', RELOAD_JS.encode() + b'</body>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f'미리보기: http://localhost:{PORT}/   (자동 새로고침 켜짐)')
        print(f'  대상 폴더: {ROOT}')
        httpd.serve_forever()
