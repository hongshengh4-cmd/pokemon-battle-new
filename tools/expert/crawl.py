import json, gzip, os, sys, time, urllib.request, concurrent.futures as cf
OUT='/home/user/work/expert/replays'; os.makedirs(OUT,exist_ok=True)
PLAN={'gen9ou':5200,'gen9randombattle':5200,'gen9nationaldex':3200}
UA={'User-Agent':'Mozilla/5.0 (research; kanto-ai replay stats)'}
def get(url,tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30) as r: return json.load(r)
        except Exception as e:
            time.sleep(1.5*(i+1)); err=e
    print('FAIL',url,err,flush=True); return None
for fmt,cap in PLAN.items():
    path=f'{OUT}/{fmt}.jsonl.gz'
    have=set()
    if os.path.exists(path):
        with gzip.open(path,'rt') as f:
            for l in f: have.add(json.loads(l)['id'])
    ids=[];page=1
    while len(ids)<cap:
        d=get(f'https://replay.pokemonshowdown.com/search.json?format={fmt}&sort=rating&page={page}')
        if not d: break
        stop=False
        for x in d:
            if (x.get('rating') or 0)<1800: stop=True;break
            if x['id'] not in have and x['id'] not in ids: ids.append(x['id'])
        if stop or len(d)<51: break
        page+=1; time.sleep(.2)
    ids=ids[:max(0,cap-len(have))]
    print(fmt,'pages',page,'new',len(ids),'have',len(have),flush=True)
    with gzip.open(path,'at') as f, cf.ThreadPoolExecutor(5) as ex:
        n=0
        for r in ex.map(lambda i:get(f'https://replay.pokemonshowdown.com/{i}.json'),ids):
            if not r or not r.get('log'): continue
            f.write(json.dumps({k:r.get(k) for k in ['id','format','formatid','players','rating','uploadtime','log']},ensure_ascii=False)+'\n'); n+=1
            if n%200==0: print(fmt,n,flush=True)
    print(fmt,'done',n,flush=True)
