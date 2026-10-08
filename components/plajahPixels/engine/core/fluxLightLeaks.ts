/** Shared optical field: the compositor blends it, particles feel the same field. */
export const FLUX_LEAK_GLSL = `
float leakShape(float kind,vec2 uv,vec2 aspect,vec2 anchor,float phase,out vec3 tint){
  vec2 center=anchor+vec2(.15*sin(phase),.12*cos(phase*2.0));
  vec2 p=(uv-center)*aspect;
  float angle=.6*sin(phase)+phase;
  vec2 q=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p;
  if(kind<.5){
    tint=vec3(1.0,.35,.13);
    return exp(-pow((uv.x-(.04+.07*sin(phase)))*5.0,2.0)-pow((uv.y-.55-.2*cos(phase))*1.8,2.0))*.42;
  }else if(kind<1.5){
    tint=vec3(.28,.38,1.0);
    return exp(-abs(q.y)*42.0)*exp(-q.x*q.x*2.0)*.8;
  }else if(kind<2.5){
    tint=.5+.5*cos(vec3(0.0,2.1,4.2)+length(p)*18.0+phase);
    return exp(-pow((length(p)-(.22+.08*sin(phase*2.0)))*18.0,2.0))*.62;
  }else if(kind<3.5){
    tint=vec3(1.0,.18,.52);
    float ribbon=q.y+.09*sin(q.x*12.0+phase*3.0);
    return exp(-abs(ribbon)*15.0)*exp(-q.x*q.x*.8)*.85;
  }else if(kind<4.5){
    tint=vec3(.15,1.0,.77);
    vec2 c=vec2(.78+.13*cos(phase),.28+.18*sin(phase));
    return exp(-dot((uv-c)*aspect,(uv-c)*aspect)*7.0)*.30;
  }else{
    tint=vec3(1.0,.72,.23);
    float rays=pow(.5+.5*cos(atan(p.y,p.x)*8.0-phase*2.0),12.0);
    return (exp(-dot(p,p)*45.0)+rays*exp(-length(p)*7.0)*.5)*.8;
  }
}
float leakField(vec2 uv,vec2 aspect,vec2 anchor,float phase,out vec3 tint,out float style){
  float cycle=mod(phase/6.28318530718,1.0)*6.0;
  style=floor(cycle);float next=mod(style+1.0,6.0);
  float blend=smoothstep(.45,1.0,fract(cycle));
  vec3 ca,cb;float a=leakShape(style,uv,aspect,anchor,phase,ca);
  float b=leakShape(next,uv,aspect,anchor,phase,cb);
  tint=mix(ca,cb,blend);return mix(a,b,blend);
}
`;
