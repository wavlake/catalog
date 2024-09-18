#Fri Sep 06 2024 00:26:48 GMT+0000
end=1725535608
#Wed Sep 06 2023 00:26:48 GMT+0000
start=1693960008

# 3 hours
interval=10800

while [ $end -ge $start ]
do
  echo timestamp: $end
  cmd='npm start -- -t '$end
  echo $cmd
  eval $cmd
  ((end -= interval))
done
