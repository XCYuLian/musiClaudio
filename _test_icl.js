
const c=require('crypto'),f=require('fs');
(async()=>{
  const body=JSON.stringify({
    app:{cluster:'volcano_icl'},
    user:{uid:'claudio'},
    audio:{voice_type:'S_xSgIXKL12',encoding:'mp3',speed_ratio:1.0},
    request:{reqid:c.randomUUID(),text:'欢迎收听Claudio电台。',text_type:'plain',operation:'query'}
  });
  const r=await fetch('https://openspeech.bytedance.com/api/v1/tts',{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':'fc1abbc4-29f5-47e0-abcd-fad74d38bc01'},body,signal:AbortSignal.timeout(15000)
  });
  const j=await r.json();
  console.log('Code:',j.code,'Msg:',j.message);
  if(j.code===3000&&j.data){const ab=await fetch(j.data);const buf=Buffer.from(await ab.arrayBuffer());f.mkdirSync('data/cache/tts',{recursive:true});f.writeFileSync('data/cache/tts/_icl_male.mp3',buf);console.log('MP3:',buf.length,'bytes')}
})().catch(e=>console.error(e.message));
