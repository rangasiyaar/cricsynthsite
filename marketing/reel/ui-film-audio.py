import json,numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt
SR=48000;DUR=45.0;N=int(SR*DUR);rng=np.random.default_rng(3)
C=json.load(open('contacts.json'))
t_=lambda d:np.arange(int(d*SR))/SR
lp=lambda x,f:sosfilt(butter(2,f,'low',fs=SR,output='sos'),x)
hp=lambda x,f:sosfilt(butter(2,f,'high',fs=SR,output='sos'),x)
def place(buf,s,at,g=1.):
    i=int(at*SR);j=min(len(buf),i+len(s))
    if j>i:buf[i:j]+=s[:j-i]*g
mid=lambda n:440*2**((n-69)/12)
music=np.zeros(N)
# kick on beats, soft hat on offbeats, from 2 s (after the click) to 42 s
def kick():
    t=t_(.35);f=48+70*np.exp(-t*30);return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9)*.8
def hat():
    t=t_(.05);return hp(rng.standard_normal(len(t)),7500)*np.exp(-t*90)*.12
K=kick()
for i in range(int(DUR/.5)):
    b=i*.5
    if 2.0<=b<42.0:
        place(music,K,b,.55 if (i%2==0) else .35)
        place(music,hat(),b+.25,.7)
# pad: Am F C G, 2 s per chord, whole film (loops)
CH=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]
for bar in range(int(DUR/2)):
    t=t_(2.0);env=np.minimum(1,t/.25)*np.minimum(1,(2.0-t)/.3)
    s=sum(np.sin(2*np.pi*mid(n)*t)+.3*np.sin(2*np.pi*mid(n)*2*t) for n in CH[bar%4])
    place(music,lp(s,1800)*env*.06,bar*2.0)
# bass pulse eighths during the middle
RT=[45,41,48,43]
for i in range(int(DUR/.25)):
    b=i*.25
    if 4.0<=b<41.5:
        t=t_(.2);s=np.sin(2*np.pi*mid(RT[int(b//2)%4])*t)*np.exp(-t*14);place(music,lp(s,600)*.18,b)
music=lp(music,9000)
sfx=np.zeros(N)
def tick(f=2400,d=.06,g=.35):
    t=t_(d);return (np.sin(2*np.pi*f*t)*np.exp(-t*70)+hp(rng.standard_normal(len(t)),3000)*np.exp(-t*160)*.3)*g
def thud(f=180,g=.5):
    t=t_(.18);return np.sin(2*np.pi*(f+80*np.exp(-t*40))*t)*np.exp(-t*22)*g
def ping(f=1320,g=.25):
    t=t_(.6);return (np.sin(2*np.pi*f*t)+.4*np.sin(2*np.pi*f*1.5*t))*np.exp(-t*6)*g
def whoosh(g=.12):
    t=t_(.4);n=rng.standard_normal(len(t));return lp(hp(n,800),3500)*np.sin(np.pi*t/.4)**2*g
for x in C['click']: place(sfx,tick(1800,.05,.45),x)
for x in C['land']:  place(sfx,thud(),x); place(sfx,tick(3000,.03,.15),x)
for x in C['keys']:  place(sfx,tick(2600,.035,.3),x)
for x in C['ret']:   place(sfx,tick(2000,.05,.4),x); place(sfx,ping(990,.18),x)
for x in C['reach']: place(sfx,ping(1320,.22),x)
for x in C['cards']: place(sfx,whoosh(),x-.05)
for x in C['send']:  place(sfx,ping(1760,.16),x)
for x in C['reset']: place(sfx,tick(1500,.05,.35),x)
mix=music*.8+sfx
mix=mix/np.max(np.abs(mix))*.89
fade=np.ones(N);n=int(.04*SR);fade[:n]=np.linspace(0,1,n);fade[-n:]=np.linspace(1,0,n)
wavfile.write('audio.wav',SR,(np.stack([mix*fade,mix*fade],1)*32767).astype(np.int16))
print('ok')
