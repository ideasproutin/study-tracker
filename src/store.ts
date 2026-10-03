import { useEffect, useState } from 'react';
import { Data, emptyData, STORAGE_KEY, validateData } from './model';
export function readData(): {data:Data; error:string} {
  try { const raw=localStorage.getItem(STORAGE_KEY); return {data:raw ? validateData(JSON.parse(raw)) : emptyData(),error:''}; }
  catch { return {data:emptyData(),error:'Your saved data could not be read. It has been preserved. Export the original data in Settings before restoring a backup or resetting.'}; }
}
export function useStudyData() {
  const [initial] = useState(readData);
  const [data,setData]=useState(initial.data), [error,setError]=useState(initial.error);
  const [readBlocked,setReadBlocked]=useState(!!initial.error);
  const update=(change:(previous:Data)=>Data, recovery=false):boolean=> {
    if(readBlocked&&!recovery) {setError('Saving is blocked to protect your unreadable data. Back it up in Settings, then import a valid backup or reset.');return false;}
    try { const next=change(data); localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); setData(next); setError(''); if(recovery)setReadBlocked(false); return true; }
    catch {setError('Could not save your changes. Browser storage may be full or disabled. Export a backup and free some storage, then try again.'); return false;}
  };
  useEffect(()=> { const listener=(event:StorageEvent)=> {if(event.key===STORAGE_KEY) {const result=readData();setData(result.data);setError(result.error);setReadBlocked(!!result.error);}}; window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener); },[]);
  return {data,update,error,readBlocked};
}
