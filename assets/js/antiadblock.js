<!-- ANTI ADBLOCK - COLOQUE NO FINAL DO <body> -->
<div id="antiAdblock" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:99999; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:20px;">
  <div style="max-width:420px; background:#1a1a24; border:3px solid #ff5722; border-radius:20px; padding:30px 25px; box-shadow:0 0 60px rgba(255,87,34,0.6);">
    
    <img src="https://i.pinimg.com/736x/43/d0/73/43d07331f525f6906df0423c17ae6dd3.jpg" 
         style="width:160px; height:160px; border-radius:50%; border:5px solid #ff5722; margin-bottom:20px;" 
         alt="Homem-Aranha">

    <h2 style="color:#ff5722; margin:0 0 15px 0; font-size:1.6rem;">E aí, parça!</h2>
    
    <p style="color:#ddd; line-height:1.6; margin-bottom:20px;">
      Sou eu, o Homem-Aranha, passando aqui pra bater um papo sincero com você...
    </p>
    
    <p style="color:#bbb; line-height:1.65; margin-bottom:25px;">
      O PipocaFlix é 100% de graça porque tem anúncios. 
      Eles são o que pagam os servidores, domínio, atualizações e pra gente continuar trazendo filme e série bom pra você sem cobrar nada.
    </p>

    <p style="color:#ffcc80; font-weight:700; margin-bottom:20px;">
      Se você usa AdBlock, o site fica sem grana e pode parar de funcionar...
    </p>

    <div style="background:rgba(255,87,34,0.15); border:1px solid #ff5722; border-radius:12px; padding:15px; margin:20px 0;">
      <strong style="color:#ffcc80;">Por favor, maninho:</strong><br>
      1. Desative o AdBlock só nesse site<br>
      2. Recarregue a página (Ctrl + F5)
    </div>

    <button onclick="window.location.reload()" 
            style="background:#ff5722; color:white; border:none; padding:14px 32px; font-size:1.1rem; font-weight:700; border-radius:50px; cursor:pointer; margin-top:10px; box-shadow:0 0 20px rgba(255,87,34,0.5);">
      ✅ RECARREGAR AGORA
    </button>

    <p style="margin-top:20px; font-size:0.85rem; color:#888;">
      A gente te agradece demais por ajudar a manter o PipocaFlix vivo! 🕸️❤️
    </p>
  </div>
</div>

<script>
// Anti-Adblock bem agressivo
function detectAdBlock() {
  const antiAdblock = document.getElementById('antiAdblock');
  
  // Teste clássico de adblock
  const testAd = document.createElement('div');
  testAd.innerHTML = '&nbsp;';
  testAd.className = 'adsbox';
  document.body.appendChild(testAd);

  setTimeout(() => {
    if (testAd.offsetHeight === 0) {
      // AdBlock detectado
      antiAdblock.style.display = 'flex';
    }
    document.body.removeChild(testAd);
  }, 100);
}

// Executa várias vezes pra ser mais eficaz
window.addEventListener('load', () => {
  detectAdBlock();
  setTimeout(detectAdBlock, 1500);
  setTimeout(detectAdBlock, 4000);
});

// Se o usuário tentar fechar a aba, avisa
window.addEventListener('beforeunload', (e) => {
  if (document.getElementById('antiAdblock').style.display === 'flex') {
    e.preventDefault();
    e.returnValue = '';
  }
});
</script>
