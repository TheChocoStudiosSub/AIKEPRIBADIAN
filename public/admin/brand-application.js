(() => {
"use strict";
const form=document.getElementById("brandForm"), file=document.getElementById("brandLogo"), preview=document.getElementById("logoPreview"), status=document.getElementById("formStatus"), button=document.getElementById("submitButton");
let logoDataUrl="";
file.addEventListener("change",()=>{
 const f=file.files?.[0];logoDataUrl="";preview.hidden=true;preview.innerHTML="";
 if(!f)return;
 if(!["image/png","image/jpeg","image/webp"].includes(f.type)||f.size>1024*1024){file.value="";status.textContent="Logo harus PNG, JPG, atau WebP dan maksimal 1 MB.";status.className="form-status error";return;}
 const reader=new FileReader();reader.onload=()=>{logoDataUrl=String(reader.result||"");preview.innerHTML='<img alt="Pratinjau logo brand" src="'+logoDataUrl+'">';preview.hidden=false;};reader.readAsDataURL(f);
});
form.addEventListener("submit",async e=>{
 e.preventDefault();status.textContent="";status.className="form-status";
 const d=new FormData(form),email=String(d.get("email")||"").trim().toLowerCase(),domains=String(d.get("domains")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!email.endsWith("@gmail.com")){status.textContent="Gunakan alamat Gmail khusus brand yang berakhiran @gmail.com.";status.className="form-status error";return;}
 if(!logoDataUrl){status.textContent="Unggah logo brand terlebih dahulu.";status.className="form-status error";return;}
 button.disabled=true;button.textContent="Mengirim pengajuan...";
 try{
  const response=await fetch("https://choco-ai-independent-seven.vercel.app/api/license?feature=tcs-public",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"brand_application",brandName:d.get("brandName"),logoDataUrl,slogan:d.get("slogan"),about:d.get("about"),direction:d.get("direction"),ownerName:d.get("ownerName"),relationshipType:d.get("relationshipType"),email,websiteUrl:d.get("websiteUrl"),repositoryUrl:d.get("repositoryUrl"),domains})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error==="rate_limited"?"Batas pengajuan harian tercapai. Coba kembali besok.":"Pengajuan belum berhasil dikirim. Periksa data dan coba kembali.");
  form.reset();logoDataUrl="";preview.hidden=true;preview.innerHTML="";
  status.textContent="Pengajuan berhasil dikirim. TCS akan menghubungi Gmail brand setelah peninjauan.";
 }catch(error){status.textContent=error.message||"Terjadi gangguan saat mengirim pengajuan.";status.className="form-status error";}
 finally{button.disabled=false;button.textContent="Kirim pengajuan brand";}
});
})();