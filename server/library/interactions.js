// Interaction library: small, dependency-free scripts included only when a
// section needs them. Each one is defensive (no-ops when its markup is
// absent), works in the sandboxed preview (storage is shimmed there) and
// respects reduced-motion. Content stays visible without JavaScript.

export const INTERACTIONS = {
  // Adds the "js" class first so reveal animations only hide content when
  // JavaScript is running.
  base: `document.documentElement.classList.add("js");
(function(){
  var items=document.querySelectorAll(".gw-reveal");
  if(!("IntersectionObserver" in window)||window.matchMedia("(prefers-reduced-motion: reduce)").matches){items.forEach(function(el){el.classList.add("is-visible")});return}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}})},{threshold:0.12});
  items.forEach(function(el){io.observe(el)});
})();`,

  mobileMenu: `(function(){
  document.querySelectorAll(".gw-menu-toggle").forEach(function(btn){
    var links=document.getElementById(btn.getAttribute("aria-controls"));
    if(!links)return;
    function set(open){links.classList.toggle("is-open",open);btn.setAttribute("aria-expanded",String(open));btn.textContent=open?"✕":"☰"}
    btn.addEventListener("click",function(){set(!links.classList.contains("is-open"))});
    links.addEventListener("click",function(e){if(e.target.closest("a"))set(false)});
    document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
  });
})();`,

  themeToggle: `(function(){
  var btn=document.querySelector(".gw-theme-toggle");if(!btn)return;
  var root=document.documentElement,key="gw-theme";
  function apply(t){root.dataset.theme=t;btn.setAttribute("aria-pressed",String(t==="dark"))}
  try{var saved=localStorage.getItem(key);if(saved)apply(saved)}catch(e){}
  btn.addEventListener("click",function(){var t=root.dataset.theme==="dark"?"light":"dark";apply(t);try{localStorage.setItem(key,t)}catch(e){}});
})();`,

  carousel: `(function(){
  document.querySelectorAll(".gw-carousel").forEach(function(box){
    var slides=box.querySelectorAll(".gw-slide"),dots=box.querySelectorAll(".gw-dot"),current=0,timer=null;
    if(slides.length<2)return;
    function show(n){current=(n+slides.length)%slides.length;slides.forEach(function(s,i){s.classList.toggle("is-active",i===current);s.setAttribute("aria-hidden",String(i!==current))});dots.forEach(function(d,i){d.classList.toggle("is-active",i===current)})}
    function start(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;stop();timer=setInterval(function(){show(current+1)},parseInt(box.dataset.interval,10)||5000)}
    function stop(){if(timer){clearInterval(timer);timer=null}}
    dots.forEach(function(d,i){d.addEventListener("click",function(){show(i);start()})});
    box.addEventListener("mouseenter",stop);box.addEventListener("mouseleave",start);
    start();
  });
})();`,

  counter: `(function(){
  var nums=document.querySelectorAll("[data-count]");
  function countUp(el){var target=parseFloat(el.dataset.count)||0,decimals=(String(target).split(".")[1]||"").length,start=null,dur=1400;
    function step(ts){if(!start)start=ts;var p=Math.min((ts-start)/dur,1);el.textContent=(target*(1-Math.pow(1-p,3))).toFixed(decimals);if(p<1)requestAnimationFrame(step)}
    requestAnimationFrame(step)}
  if(!("IntersectionObserver" in window)||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){countUp(e.target);io.unobserve(e.target)}})},{threshold:0.5});
  nums.forEach(function(el){io.observe(el)});
})();`,

  // Forms validate in the browser and confirm on screen. They do not send
  // data anywhere until the owner connects a form service.
  forms: `(function(){
  document.querySelectorAll("form.gw-form").forEach(function(form){
    var status=form.querySelector(".gw-form-status");
    form.addEventListener("submit",function(e){
      e.preventDefault();
      var ok=true;
      form.querySelectorAll("input,textarea").forEach(function(f){var bad=!f.checkValidity();f.classList.toggle("is-invalid",bad);if(bad&&ok){ok=false;f.focus()}});
      if(!ok){if(status)status.textContent="Please fill in the highlighted fields.";return}
      if(status)status.textContent="Thank you! We will get back to you soon.";
      form.reset();
    });
  });
})();`,

  filter: `(function(){
  document.querySelectorAll(".gw-filter-input").forEach(function(input){
    var scope=input.closest("section");if(!scope)return;
    input.addEventListener("input",function(){var q=input.value.trim().toLowerCase();
      scope.querySelectorAll(".gw-filter-item").forEach(function(item){item.style.display=!q||item.textContent.toLowerCase().includes(q)?"":"none"})});
  });
})();`,
}

// Ordered, de-duplicated script for the given interaction ids ("base" always first).
export function buildScript(ids) {
  const wanted = ["base", ...ids.filter(id => id !== "base")]
  return [...new Set(wanted)].filter(id => INTERACTIONS[id]).map(id => INTERACTIONS[id]).join("\n")
}
