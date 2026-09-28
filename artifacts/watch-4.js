ast-card"><img class="cast-img" loading="lazy" src="' + profileImg(c.profile_path) + '" alt=""><div class="cast-name">' + c.name + '</div><div class="cast-role">' + (c.character||"") + '</div></div>').join("") +
        '</div></div>' : '') +
      (similar.length ? '<div class="modal-section"><div class="modal-section-title">Similar</div><div class="mini-rail">' + similar.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      (recs.length ? '<div class="modal-section"><div class="modal-section-title">You Might Also Like</div><div class="mini-rail">' + recs.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      '<div class="modal-links" style="margin-top:26px;">' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.themoviedb.org/' + type + '/' + id + '">TMDB</a>' +
      (imdbId ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.imdb.com/title/' + imdbId + '/">IMDb</a>' : '') +
      '</div></div>';

    document.getElementById("modalCloseBtn").onclick = closeModal;
    document.getElementById("modalPlay").onclick = () => openPlayer(id, type, titleOf(data), data);
    document.getElementById("modalSave").onclick = () => {
      toggleSave(data, type);
      const s = isSaved(id, type);
      const mb = document.getElementById("modalSave");
      mb.classList.toggle("saved", s); mb.innerHTML = bookmarkSvg(s);
    };
    const trBtn = document.getElementById("modalTrailer");
    if (trBtn && trailer) trBtn.onclick = () => window.open("https://www.youtube.com/watch?v=" + trailer.key, "_blank");
    modalContent.querySelectorAll(".mini-card").forEach(mc => {
      mc.onclick = () => { closeModal(); setTimeout(() => openModal(mc.dataset.id, mc.dataset.type), 100); };
    });
  } catch(e){
    if (myToken !== modalToken) return;
    modalContent.innerHTML = '<div class="loader err">Couldn\'t load details.<br><code>' + e.message + '</code><br><button class="btn btn-ghost" id="modalCloseBtn2" style="margin-top:10px;">Close</button></div>';
    document.getElementById("modalCloseBtn2").onclick = closeModal;
  }
}
function closeModal(){ modalBackdrop.classList.remove("open"); modalContent.innerHTML = ""; }
modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){
    if (document.getElementById("playerOverlay").classList.contains("open")) closePlayer();
    else closeModal();
  }
  if (e.key === "/" && !e.target.matches("input,select,textarea")){ e.preventDefault(); searchInput.focus(); }
});

/* ================= BOOT ================= */
try { const saved = localStorage.getItem("goar_region"); if (saved) REGION = saved; } catch(e){}
buildRegionSelect();
buildCatBar();
buildPillNav();
buildHome();

buildWispSelect();
setTimeout(() => {
  ensureLibcurl().then(() => buildWispSelect()).catch(e => {
    console.warn("WISP warm-up failed:", e && e.message ? e.message : e);
    buildWispSelect();
  });
}, 200);
