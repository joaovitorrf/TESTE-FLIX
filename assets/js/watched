(function(){
  'use strict';
  var KEY='pflix_watched_list';
  function getAll(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];}}
  function add(item){var a=getAll().filter(function(i){return i.nome!==item.nome;});a.unshift(Object.assign({},item,{ts:Date.now()}));try{localStorage.setItem(KEY,JSON.stringify(a.slice(0,500)));}catch(e){}}
  function remove(nome){var a=getAll().filter(function(i){return i.nome!==nome;});try{localStorage.setItem(KEY,JSON.stringify(a));}catch(e){}}
  function has(nome){return getAll().some(function(i){return i.nome===nome;});}
  function clear(){try{localStorage.removeItem(KEY);}catch(e){}}
  window.PipocaWatched={add:add,remove:remove,has:has,getAll:getAll,clear:clear};
})();
