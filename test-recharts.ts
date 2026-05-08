import * as recharts from 'recharts';
const exp = ['LineChart', 'Line', 'XAxis', 'YAxis', 'Tooltip', 'ResponsiveContainer', 'AreaChart', 'Area', 'Cell'];
let err = false;
for (const e of exp) {
  if (!recharts[e]) {
    console.error('Undefined export:', e);
    err = true;
  }
}
if (!err) console.log('All recharts exports exist!');
