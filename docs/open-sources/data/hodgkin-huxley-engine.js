/* Hodgkin-Huxley axon engine (absolute-voltage convention, rest about -65 mV).
   Equations: C dV/dt = -gNa m^3 h (V-ENa) - gK n^4 (V-EK) - gL (V-EL) + I + D d2V/dx2
   Rate functions are the standard modern forms of the 1952 fits. */
const HH={C:1,gNa:120,gK:36,gL:.3,ENa:50,EK:-77,EL:-54.387,T0:6.3};
const aN=V=>{const x=V+55;return Math.abs(x)<1e-7?.1:.01*x/(1-Math.exp(-x/10))};
const bN=V=>.125*Math.exp(-(V+65)/80);
const aM=V=>{const x=V+40;return Math.abs(x)<1e-7?1:.1*x/(1-Math.exp(-x/10))};
const bM=V=>4*Math.exp(-(V+65)/18);
const aH=V=>.07*Math.exp(-(V+65)/20);
const bH=V=>1/(1+Math.exp(-(V+35)/10));
function steady(V){const m=aM(V)/(aM(V)+bM(V)),h=aH(V)/(aH(V)+bH(V)),n=aN(V)/(aN(V)+bN(V));return{m,h,n}}
class Axon{
 /* N compartments. node[i]=true: full HH membrane. myelinated internodes: passive, low capacitance. */
 constructor(N,opts={}){
  this.N=N;this.dx=opts.dx||.05;           // cm per compartment
  this.D=opts.D||.336;                      // mS: a/(2 Ri), squid a=238 um, Ri=35.4 ohm cm
  this.T=opts.T||6.3;this.myel=!!opts.myel;this.blockNa=false;this.blockK=false;
  this.V=new Float64Array(N).fill(-65);const s=steady(-65);
  this.m=new Float64Array(N).fill(s.m);this.h=new Float64Array(N).fill(s.h);this.n=new Float64Array(N).fill(s.n);
  this.I=new Float64Array(N);this.t=0;this.setMyelin(this.myel);
  this._a=new Float64Array(N);this._b=new Float64Array(N);this._c=new Float64Array(N);this._d=new Float64Array(N);this._cp=new Float64Array(N);this._dp=new Float64Array(N)}
 setMyelin(on,spacing=10){this.myel=on;const N=this.N;this.node=new Array(N).fill(true);this.Cm=new Float64Array(N).fill(1);this.gLm=new Float64Array(N).fill(HH.gL);
  if(on){for(let i=0;i<N;i++){const isNode=(i%spacing===0)||i===N-1;this.node[i]=isNode;if(!isNode){this.Cm[i]=.02;this.gLm[i]=.003}}}}
 phi(){return Math.pow(3,(this.T-HH.T0)/10)}
 step(dt,Iinj){ // operator splitting: ionic (explicit/exponential gates) then implicit diffusion
  const N=this.N,V=this.V,ph=this.phi();
  for(let i=0;i<N;i++){
   const v=V[i];let Iion=0;
   if(this.node[i]){
    const am=aM(v)*ph,bm=bM(v)*ph,ah=aH(v)*ph,bh=bH(v)*ph,an=aN(v)*ph,bn=bN(v)*ph;
    this.m[i]+=(am*(1-this.m[i])-bm*this.m[i])*dt;this.h[i]+=(ah*(1-this.h[i])-bh*this.h[i])*dt;this.n[i]+=(an*(1-this.n[i])-bn*this.n[i])*dt;
    const m=this.m[i],h=this.h[i],n=this.n[i];
    const gNa=this.blockNa?0:HH.gNa*m*m*m*h,gK=this.blockK?0:HH.gK*n*n*n*n;
    Iion=gNa*(v-HH.ENa)+gK*(v-HH.EK)+HH.gL*(v-HH.EL)}
   else Iion=this.gLm[i]*(v-HH.EL);
   this.I[i]=Iion;
   V[i]=v+dt*((Iinj?Iinj[i]:0)-Iion)/this.Cm[i]}
  // implicit diffusion: (I - dt*k*L) V = V*, with k=D/(dx^2*Cm)
  const a=this._a,b=this._b,c=this._c,d=this._d,cp=this._cp,dp=this._dp,D=this.D/(this.dx*this.dx);
  for(let i=0;i<N;i++){const k=dt*D/this.Cm[i];a[i]=i>0?-k:0;c[i]=i<N-1?-k:0;b[i]=1+(i>0?k:0)+(i<N-1?k:0);d[i]=V[i]}
  cp[0]=c[0]/b[0];dp[0]=d[0]/b[0];
  for(let i=1;i<N;i++){const mm=b[i]-a[i]*cp[i-1];cp[i]=c[i]/mm;dp[i]=(d[i]-a[i]*dp[i-1])/mm}
  V[N-1]=dp[N-1];for(let i=N-2;i>=0;i--)V[i]=dp[i]-cp[i]*V[i+1];
  this.t+=dt}
}
if(typeof module!=='undefined')module.exports={HH,Axon,steady,aN,bN,aM,bM,aH,bH};
