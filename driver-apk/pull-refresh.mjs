export function installPullRefresh({ canRefresh, refresh }) {
  const style=document.createElement('style');
  style.textContent='html{overscroll-behavior-y:contain}.apk-pull-status{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);z-index:100000;padding:10px 18px;border-radius:24px;background:#fff;color:#172033;box-shadow:0 3px 16px #0003;font:600 14px Arial,sans-serif;pointer-events:none;white-space:nowrap}.apk-pull-status[hidden]{display:none}';
  document.head.appendChild(style);
  const status=document.createElement('div');
  status.className='apk-pull-status';status.hidden=true;
  status.setAttribute('role','status');
  document.body.appendChild(status);
  let start=null, distance=0, busy=false, hideTimer;
  const atTop=()=>Math.max(window.scrollY,document.documentElement.scrollTop,document.body.scrollTop)<=0;
  function blocked(target) {
    if(target.closest('input,textarea,select,button,a,video,canvas,[contenteditable="true"],.leaflet-container')) return true;
    if([...document.querySelectorAll('[aria-modal="true"]')].some(dialog=>dialog.getClientRects().length)) return true;
    for(let node=target;node && node!==document.body;node=node.parentElement) {
      if(node.scrollHeight>node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
    }
    return false;
  }
  function reset() {start=null;distance=0;if(!busy)status.hidden=true;}
  document.addEventListener('touchstart',event=>{
    if(busy || event.touches.length!==1 || !atTop() || !canRefresh() || blocked(event.target)) return;
    clearTimeout(hideTimer);
    start={x:event.touches[0].clientX,y:event.touches[0].clientY};distance=0;
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    if(!start)return;
    if(event.touches.length!==1 || !atTop() || !canRefresh()){reset();return;}
    const dx=Math.abs(event.touches[0].clientX-start.x);
    const dy=event.touches[0].clientY-start.y;
    if(dy<0 || dx>Math.max(12,dy)){reset();return;}
    distance=dy;
    if(dy>12){
      if(event.cancelable)event.preventDefault();
      status.hidden=false;
      status.textContent=dy>=85?'Release to refresh':'Pull down to refresh';
    }
  },{passive:false});
  document.addEventListener('touchcancel',reset,{passive:true});
  document.addEventListener('touchend',async()=>{
    const ready=start && distance>=85 && canRefresh();
    start=null;distance=0;
    if(!ready){reset();return;}
    busy=true;status.hidden=false;status.textContent='Refreshing…';
    try {await refresh();status.textContent=navigator.onLine?'Refreshed':'Saved tasks refreshed — offline';}
    catch(_){status.textContent='Could not refresh. Please try again.';}
    finally {busy=false;hideTimer=setTimeout(()=>{status.hidden=true;},1500);}
  },{passive:true});
}
