#!/bin/zsh
cd "$(dirname "$0")"
echo "预览地址：http://localhost:4173/fom-decal-preview.html"
echo "按 Control+C 可停止服务。"
(sleep 1; open "http://localhost:4173/fom-decal-preview.html") &
python3 -m http.server 4173
