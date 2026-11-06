set term pngcairo              # 定义图像格式 输出PNG到标准输出
unset border              # 不显示外框
set zeroaxis lt -1 lw 2   # 画出X轴与Y轴
set xrange [-200 : 200]
set yrange [-200 : 200]

plot sin(x)