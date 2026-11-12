"""Fit a small regularized linear outcome model; no neural-network claims."""
import csv,json
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1]
rows=list(csv.DictReader((root/'models/training.csv').open()))
sets={}
for name in ['train','validation']:
    a=[r for r in rows if r['split']==name]
    sets[name]=(np.array([[float(r[f'f{i}']) for i in range(10)] for r in a]),np.array([float(r['target']) for r in a]))
x,y=sets['train']; ridge=1.0
penalty=np.eye(10)*ridge;penalty[0,0]=0
weights=np.linalg.solve(x.T@x+penalty,x.T@y)
report={'format':'laser-linear-model-v1','algorithm':'ridge regression','features':['bias','score_difference/3','side_to_move','side*mean_beam_core_proximity','side*max_beam_core_proximity','side*lit_mirror_fraction','score_difference*remaining_turn_fraction','side*remaining_core_fraction','side*slash_fraction','side*turn_fraction'],'weights':weights.tolist(),'ridge':ridge,'trainingData':json.loads((root/'models/dataset.json').read_text()),'evaluation':{}}
for name,(a,b) in sets.items():
    pred=np.clip(a@weights,-.99,.99)
    report['evaluation'][name]={'positions':len(b),'meanSquaredError':float(np.mean((pred-b)**2)),'meanAbsoluteError':float(np.mean(np.abs(pred-b)))}
(root/'models/model.json').write_text(json.dumps(report,indent=2)+'\n')
(root/'cpp/model.hpp').write_text('#pragma once\nnamespace laser {\n// Fitted by scripts/train-model.py; see models/model.json.\nconstexpr double LEARNED_WEIGHTS[10]={'+','.join(f'{v:.17g}' for v in weights)+'};\n}\n')
print(json.dumps(report['evaluation'],indent=2))
