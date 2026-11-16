(()=>{
  'use strict';
  function current(){return [...document.querySelectorAll('dialog[open]')].at(-1);}
  function lock(){document.documentElement.classList.toggle('modal-open',!!current());}
  new MutationObserver(lock).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});
  document.addEventListener('wheel',event=>{const modal=current();if(!modal)return;const target=event.target instanceof Element?event.target:null;if(!target||!modal.contains(target)){event.preventDefault();return;}let node=target;while(node&&node!==modal){if(node.scrollHeight>node.clientHeight&&['auto','scroll'].includes(getComputedStyle(node).overflowY)){const delta=event.deltaY;if(delta<0&&node.scrollTop>0||delta>0&&node.scrollTop+node.clientHeight<node.scrollHeight-1)return;}node=node.parentElement;}event.preventDefault();},{capture:true,passive:false});
  lock();window.LumaModals={refresh:lock};
})();
