import sys
import getopt
import http.server
import socketserver

class CustomHandler(http.server.SimpleHTTPRequestHandler):
	def end_headers(self):
		# Add your custom headers here
		self.send_header("Access-Control-Allow-Origin", "*")
		self.send_header("X-Custom-Header", "MyCustomValue")
		super().end_headers()

port = 8000

argv = sys.argv[1:]

try:
	opts, args = getopt.getopt(argv, "p:")  # 短选项模式

except:
	print("Error")

for opt, arg in opts:
	if opt in ['-p']:
		port = int(arg)

with socketserver.TCPServer(("", port), CustomHandler) as httpd:
	print(f"Serving on port {port}")
	httpd.serve_forever()
