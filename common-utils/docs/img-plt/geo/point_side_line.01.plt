set term pngcairo         # 定义图像格式 输出PNG到标准输出
unset border              # 不显示外框
set key off               # 不显示图例
# set zeroaxis lt -1 lw 2   # 画出X轴与Y轴
unset xtics
unset ytics
set xrange [-5 : 65]
set yrange [-5 : 65]
# set grid
set size ratio -1 # 去掉比率的变化，不然圆在Y轴上会变形

array P[2]
P[1]=30
P[2]=20

array A[2]
A[1]=10
A[2]=10

array B[2]
B[1]=50
B[2]=60


set arrow  1 from   -5,   0 to 65, 0 nofilled size 3,5,5 lc rgb "#000000" lw 2
set arrow  2 from    0,  -5 to  0,65 nofilled size 3,5,5 lc rgb "#000000" lw 2
set arrow  3 from A[1], A[2] to B[1],B[2] nofilled size 8,0,0 lc rgb "#0000FF" lw 3
set arrow  4 from A[1], A[2] to P[1],P[2] nofilled size 8,0,0 lc rgb "#FF0000" lw 1

set arrow  6 from   -5,A[2] to   65, A[2] nofilled size 3,5,5 lc rgb "#AAAAAA" lw 1
set arrow  7 from A[1],  -5 to A[1],   65 nofilled size 3,5,5 lc rgb "#AAAAAA" lw 1
set arrow  8 from P[1], P[2] to P[1],A[2] nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1
set arrow  9 from B[1], B[2] to B[1],A[2] nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1
set arrow 10 from P[1], P[2] to A[1],P[2] nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1
set arrow 11 from B[1], B[2] to A[1],B[2] nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1

set label 1 at P[1],P[2] point pt 7 ps 1.5 lc rgb "#F87217"
set label 2 at A[1],A[2] point pt 7 ps 1.5 lc rgb "#FF0000"
set label 3 at B[1],B[2] point pt 7 ps 1.5 lc rgb "#00FF00"
set label 4 at A[1],P[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"
set label 5 at A[1],B[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"
set label 6 at P[1],A[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"
set label 7 at B[1],A[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"

set label  9 "P"    at P[1]-3,P[2]+2
set label 11 "A"    at A[1]-3,A[2]-3
set label 12 "B"    at B[1]  ,B[2]+3
set label 13 "B.dx" at B[1]  ,A[2]-2
set label 14 "p.dx" at P[1]  ,A[2]-2
set label 15 "B.dy" at A[1]-7,B[2]   
set label 16 "P.dy" at A[1]-7,P[2]   


plot 1/0
