set term pngcairo         # 定义图像格式 输出PNG到标准输出
unset border              # 不显示外框
set key off               # 不显示图例
# set zeroaxis lt -1 lw 2   # 画出X轴与Y轴
set xrange [-5 : 70]
set yrange [-5 : 55]
# set xtics 5
# set ytics 5
unset xtics
unset ytics
# set grid
set size ratio -1 # 去掉比率的变化，不然圆在Y轴上会变形

array P[2]
P[1]=5
P[2]=5
array C[3]
C[1]=45
C[2]=30
C[3]=20

array Q1[2]
Q1[1]=28.21
Q1[2]=40.87

array Q2[2]
Q2[1]=47.4
Q2[2]=10.15

dx=C[1]-P[1]
dy=C[2]-P[2]

set arrow 1 from   -5,  0 to 70, 0 nofilled size 3,5,5 lc rgb "#000000" lw 2
set arrow 2 from    0, -5 to  0,55 nofilled size 3,5,5 lc rgb "#000000" lw 2
set arrow 3 from   -5, 30 to 70,30 nofilled size 3,5,5 lc rgb "#AAAAAA" lw 2
set arrow 4 from   45, -5 to 45,55 nofilled size 3,5,5 lc rgb "#AAAAAA" lw 2

set label 1 at  P[1], P[2] point pt 7 ps 1.5 lc rgb "#F87217"
set label 2 at  C[1], C[2] point pt 7 ps 1.5 lc rgb "#0000FF"
set label 3 at Q1[1],Q1[2] point pt 7 ps 1.5 lc rgb "#FF0000"
set label 4 at Q2[1],Q2[2] point pt 7 ps 1.5 lc rgb "#00FF00"
# set label 5 at  C[1], P[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"
# set label 6 at  P[1], C[2] point pt 7 ps 1.5 lc rgb "#AAAAAA"

set label  9 "P"  at  P[1]-3,  P[2]+2
set label 10 "C"  at  C[1]+1,  C[2]-2 
set label 11 "Q1" at Q1[1]-5, Q1[2]-1
set label 12 "Q2" at Q2[1]+1, Q2[2]-2
set label 13 "dx" at  P[1]+9,      -1
set label 14 "dy" at      -3,  P[2]+9
set label 15 "{/Symbol a}"  at C[1] -2, C[2]+4 tc rgb "#0000FF" 
set label 16 "-{/Symbol b}" at C[1] -8, C[2]   tc rgb "#FF0000" 
set label 17 "+{/Symbol b}" at C[1] -5, C[2]-6 tc rgb "#00FF00" 
set label 18 "{/Symbol b}1" at C[1] +2, C[2]+7 tc rgb "#FF00FF" 
set label 19 "{/Symbol b}2" at C[1] -9, C[2]+9 tc rgb "#A20055" 

set arrow  5 from P[1], P[2] to  C[1], C[2] nofilled size 8,0,0 lc rgb "#0000FF" lw 1
set arrow  6 from P[1], P[2] to Q1[1],Q1[2] nofilled size 8,0,0 lc rgb "#FF0000" lw 1
set arrow  7 from P[1], P[2] to Q2[1],Q2[2] nofilled size 8,0,0 lc rgb "#00FF00" lw 1
set arrow  8 from C[1], C[2] to Q1[1],Q1[2] nofilled size 8,0,0 lc rgb "#FF0000" lw 1
set arrow  9 from C[1], C[2] to Q2[1],Q2[2] nofilled size 8,0,0 lc rgb "#00FF00" lw 1
set arrow 10 from P[1], C[2] to     5,   -5 nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1
set arrow 11 from C[1], P[2] to    -5,    5 nofilled size 8,0,0 lc rgb "#AAAAAA" lw 1

set object 1 circle at C[1],C[2] size C[3] fc rgb "#0000FF" lw 2
set object 2 circle at C[1],C[2] size    3 arc [  0:213] fc rgb "#0000FF" lw 1
set object 3 circle at C[1],C[2] size    5 arc [213:277] fc rgb "#00FF00" lw 1
set object 4 circle at C[1],C[2] size    5 arc [147:213] fc rgb "#FF0000" lw 1
set object 5 circle at C[1],C[2] size    6 arc [  0:147] fc rgb "#FF00FF" lw 1
set object 6 circle at C[1],C[2] size   10 arc [  0:277] fc rgb "#A20055" lw 1

plot 1/0 

