set term pngcairo         # 定义图像格式 输出PNG到标准输出
unset border              # 不显示外框
set key off               # 不显示图例
set zeroaxis lt -1 lw 2   # 画出X轴与Y轴
set xrange [-70 : 70]
set yrange [-70 : 70]

set label 1 at  30, 60 point pt 7 ps 1.5 lc rgb "#F87217"
set label 2 at  60, 30 point pt 7 ps 1.5 lc rgb "#F87217"
set label 3 at  60,-30 point pt 7 ps 1.5 lc rgb "#F87217"
set label 4 at  30,-60 point pt 7 ps 1.5 lc rgb "#F87217"
set label 5 at -30,-60 point pt 7 ps 1.5 lc rgb "#F87217"
set label 6 at -60,-30 point pt 7 ps 1.5 lc rgb "#F87217"
set label 7 at -60, 30 point pt 7 ps 1.5 lc rgb "#F87217"
set label 8 at -30, 60 point pt 7 ps 1.5 lc rgb "#F87217"

set label  9 "A" at  25, 60
set label 10 "B" at  60, 25 
set label 11 "A" at  60,-25
set label 12 "B" at  25,-60
set label 13 "A" at -25,-60
set label 14 "B" at -60,-25
set label 15 "A" at -60, 25
set label 16 "B" at -25, 60

set arrow 1 from  30, 60 to  60, 30 nofilled size 8,15,13 lc rgb "#FF0000" lw 1
set arrow 2 from  60,-30 to  30,-60 nofilled size 8,15,13 lc rgb "#00FF00" lw 1
set arrow 3 from -30,-60 to -60,-30 nofilled size 8,15,13 lc rgb "#0000FF" lw 1
set arrow 4 from -60, 30 to -30, 60 nofilled size 8,15,13 lc rgb "#666666" lw 1

plot \
	x < 0 ? 1/0 :  2*x lc rgb "#FF0000", x < 0 ? 1/0 : x / 2 lc rgb "#FF0000" , \
	x < 0 ? 1/0 : -2*x lc rgb "#00FF00", x < 0 ? 1/0 : x /-2 lc rgb "#00FF00" , \
	x > 0 ? 1/0 :  2*x lc rgb "#0000FF", x > 0 ? 1/0 : x / 2 lc rgb "#0000FF" , \
	x > 0 ? 1/0 : -2*x lc rgb "#666666", x > 0 ? 1/0 : x /-2 lc rgb "#666666" 