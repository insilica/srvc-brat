(function () {
    // srvc-related

    var config = null;
    var currentDocEvents = null;
    var docEntities = null;
    var docArcs = null;

    const currentLabels = async function() {
        return (await config)['current-labels'] || (await config)['current_labels']
    }

    const loadConfig = function () {
        config = new Promise((resolve, reject) => {
            var req = new XMLHttpRequest();
            req.addEventListener("load", function (resp) {
                resolve(JSON.parse(req.response));
            });
            req.open("GET", "/srvc/config");
            req.send();
        });
    };

    const loadCurrentDocEvents = function () {
        currentDocEvents = new Promise((resolve, reject) => {
            var req = new XMLHttpRequest();
            req.addEventListener("load", function (resp) {
                const events = JSON.parse(req.response);
                resolve(events);
                location.hash = '#/document/' + events[0].hash;
            });
            req.open("GET", "/srvc/current-doc-events");
            req.send();
        });
    };

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    const bratToWebAnno = async (entities, arcs) => {
        var annos = [];
        var annoLogs = [];
        for (i in entities) {
            const doc = (await currentDocEvents)[0];
            const entity = entities[i];
            const end = entity[2][0][1];
            const start = entity[2][0][0];
            const uuid = generateUUID();
            const annoLog = {
                "id": entity[0],
                "uuid": uuid
            }
            annoLogs.push(annoLog);
            const anno = {
                "@context": "http://www.w3.org/ns/anno.jsonld",
                "body": [
                    {
                        "purpose": "tagging",
                        "type": "TextualBody",
                        "value": entity[1],
                    }],
                "id": uuid,
                "target":
                {
                    "selector":
                    [
                        {
                            "exact": doc.data.abstract.substring(start,end),
                            "type": "TextQuoteSelector",
                        },
                        {
                            "end": end,
                            "start": start,
                            "type": "TextPositionSelector",
                        }
                    ]
                },
                "type": "Annotation",
            };
            annos.push(anno);
        }

        for (i in arcs) {
            const doc = (await currentDocEvents)[0];
            const arc = arcs[i];
            const arcO = arc[2];
            const arcT = arc[3];
            const arcOId = annoLogs.find(obj => obj.id === arcO)?.uuid;
            const arcTId = annoLogs.find(obj => obj.id === arcT)?.uuid;
            if (arc0Id && arcTid) {
                const uuid = generateUUID();
                const anno = {
                    "@context": "http://www.w3.org/ns/anno.jsonld",
                    "body": [
                        {
                            "purpose": "tagging",
                            "type": "TextualBody",
                            "value": arc[1],
                        }],
                    "id": uuid,
                    "motivation": "linking",
                    "target": [
                        {
                            "id": arcOId
                        },
                        {
                            "id": arcTId
                        }
                    ],
                    "type": "Annotation",
                };
                annos.push(anno);
            }
        }

        console.log('bratToWebAnnoLogBegin');
        console.log(annos);
        console.log('bratToWebAnnoLogEnd');
        return annos;
    };

    const submitDoc = async function () {
        var req = new XMLHttpRequest();
        req.addEventListener("load", function (resp) {
            docEntities = null;
            loadCurrentDocEvents();
        })
        req.open("POST", "/srvc/submit-label-answers");
        req.setRequestHeader("Content-Type", "application/json");
        var answer = {
            "data": {
                "answer": await bratToWebAnno(docEntities, docArcs),
                "document": (await currentDocEvents)[0].hash,
                "label": (await currentLabels())[0].hash,
                "reviewer": (await config).reviewer,
                "timestamp": Math.floor(Date.now() / 1000),
            },
            "type": "label-answer",
        };
        req.send(JSON.stringify({answers: [answer]}));
    };

    loadConfig();
    loadCurrentDocEvents();

    window.addEventListener('load', () => {
        document.getElementById('srvc-submit').addEventListener('click', () => {
            submitDoc()
        });
    });

    // brat-related

    var now = Date.now();
    const emptyDoc = {
        attributes: [],
        ctime: now,
        comments: [],
        entities: [],
        equivs: [],
        events: [],
        messages: [],
        mtime: now,
        relations: [],
        source_files: [],
        text: "",
        triggers: [],
    };

    const createSpanResponse = (data) => {
        const sourceData = data.sourceData;

        // This is a string for some reason
        const offsets = JSON.parse(data.offsets);

        // Find the next-highest id
        var id = -1;
        for (i in sourceData.entities) {
            const entityId = parseInt(sourceData.entities[i][0]);
            if (entityId > id) {
                id = entityId
            }
        }
        id = '' + (id + 1);

        // Add the new span to the existing ones
        sourceData.entities.push([id, data.type, offsets]);
        return {
            action: 'createSpan',
            annotations: sourceData,
            edited: [[id]],
            messages: [],
            protocol: 1
        }
    };

    const deleteSpanResponse = (data) => {
        var entities = [];
        for (i in data.sourceData.entities) {
            const entity = data.sourceData.entities[i];
            if (entity[0] != data.id) {
                entities.push(entity);
            }
        }
        data.sourceData.entities = entities;

        return {
            action: 'deleteSpan',
            annotations: data.sourceData,
            edited: [[data.id]],
            messages: [],
            protocol: 1
        }
    }

    const createArcResponse = (data) => {
        console.log('createSpanLogBegin');
        console.log(data);        
        console.log('createSpanLogEnd');
        let equivIndex = '*' + data.sourceData.equivs.length;
        data.sourceData.equivs.push([equivIndex, data.type, data.origin, data.target]);
        return {
            action: 'createArc',
            annotations: data.sourceData,
            edited: [[data.origin]],
            messages: [],
            protocol: 1
        }
    };

    const deleteArcResponse = (data) => {
        console.log('deleteArcLogBegin');
        console.log(data);        
        console.log('deleteArcLogEnd');
        
        for (i in data.sourceData.equivs) {
            const equiv = data.sourceData.equivs[i];
            if (data.old_type === equiv[1] &&
                data.old_target === equiv[2] &&
                data.origin === equiv[3]) {
                data.sourceData.equivs.splice(i, 1);
                i--;
            }
        }
        return {
            action: 'deleteArc',
            annotations: data.sourceData,
            edited: [[data.origin]],
            messages: [],
            protocol: 1
        }
    }

    const generateArcs = (label) => {
        var arcs = [];
        for (k in label.relationships) {
            var targets = [];
            for (x in label.relationships[k]) {
                targets.push(label.relationships[k][x].to);
            }
            arcs.push({
                arrowHead: 'triangle,5',
                color: 'black',
                labels: [k],
                targets: targets.flat(),
                type: k
            });
        }
        return arcs;
    }

    const generateEntityTypes = async () => {
        var types = [];
        const label = (await currentLabels())[0]
        const arcs = generateArcs(label);
        const entities = (label.entities || []);
        for (k in entities) {
            const entity = entities[k];
            types.push({
                arcs: arcs,
                attributes: [],
                bgColor: '#ffccaa',
                borderColor: 'darken',
                children: [],
                fgColor: 'black',
                name: entity,
                normalizations: [],
                type: entity,
            });
        }
        return types;
    }

    const generateCollectionVals = async (request) => {
        request.success({
            action: "getCollectionInformation",
            disambiguator_config: [],
            entity_types: await generateEntityTypes(),
            event_types: [],
            items: [],
            messages: [],
            relation_attribute_types: [],
            search_config: [
                ["Google", "http://www.google.com/search?q=%s"],
                ["PubMed", "https://pubmed.ncbi.nlm.nih.gov/?term=%s"],
                ["Wikipedia", "http://en.wikipedia.org/wiki/Special:Search?search=%s"],
            ],
            ui_names: {
                attributes: "attributes",
                entities: "entities",
                events: "events",
                relations: "relations"
            },
            unconfigured_types: [],
        });
    };

    const webAnnoToBrat = (anno) => {
        const body = anno.body;
        var txt;
        for (i in body) {
            if (body[i].type == 'TextualBody') {
                txt = body[i].value;
            }
        }
        
        const selector = anno.target.selector;
        var pos;
        for (i in selector) {
            if (selector[i].type == 'TextPositionSelector') {
                pos = selector[i];
            }
        }

        return [txt, [[pos.start, pos.end]], anno.id];
    };

    const getDocEntities = async () => {
        const cfg = await config;
        const events = await currentDocEvents;
        const label = ((await currentLabels()) || [null])[0];
        if (!label) return [];
        var entities = [];
        var equivs = [];
        for (i in events) {
            const event = events[i];
            if (event.type == 'label-answer'
                //&& label.hash == event.data.label
            ) {
                for (j in event.data.answer) {
                    if (event.data.answer[j].motivation == 'linking') {
                        equivs.push(event.data.answer[j]);
                    } else {
                        entities.push(webAnnoToBrat(event.data.answer[j]));
                    }
                };
            }
        }

        // Remove duplicates
        entities.sort((x, y) => {
            const a = x[1][0];
            const b = y[1][0];
            if (a[0] > b[0]) {
                return 1;
            } else if (a[0] < b[0]) {
                return -1;
            } else if (a[1] > b[1]) {
                return 1;
            } else if (a[1] < b[1]) {
                return -1;
            } else {
                return 0;
            }
        });
        var lastEntity;
        var lastUnique;
        var uniqueEntities = [];
        var duplicateEntities = [];
        for (i in entities) {
            const entity = entities[i];
            if (!lastEntity || lastEntity[0] != entity[0] || lastEntity[1][0][0] != entity[1][0][0] || lastEntity[1][0][1] != lastEntity[1][0][1]) {
                uniqueEntities.push(entity);
                duplicateEntities.push({
                    "entity": entity,
                    "duplicates": []
                });
                lastUnique = entity;
            } else {
                duplicateEntities[duplicateEntities.length-1].duplicates.push(entity);
            }
            lastEntity = entity;
        }
        entities = uniqueEntities;

        // Add indices
        for (i in entities) {
            entities[i].unshift(i + '');
        }

        
        var tempEquivs = [];
        for (i in equivs) {
            let equivIndex = '*' + i;
            let equivType = equivs[i].body[0].value;
            let equivOrigin = equivs[i].target[0].id;
            let equivTarget = equivs[i].target[1].id;
            for (n in duplicateEntities) {
                let dEn = duplicateEntities[n];
                if (equivOrigin == dEn.entity[2]) {
                    equivOrigin = dEn.entity[0];
                } else if (equivTarget == dEn.entity[2]) {
                    equivTarget = dEn.entity[0];
                } else {
                    for (d in dEn.duplicates) {
                        let dEnD = dEn.duplicates[d];
                        if (dEnD[2] == equivOrigin) {
                            equivOrigin = dEn.entity[0];
                        }
                        if (dEnD[2] == equivTarget) {
                            equivTarget = dEn.entity[0];
                        }
                    }
                }
            }
            if (equivOrigin && equivTarget) {
                tempEquivs.push([equivIndex, equivType, equivOrigin, equivTarget]);
            }
        }

        equivs = tempEquivs;

        return {'entities': entities, 'equivs': equivs};;
    };

    const getDocEquivs = async() => {
        
    };

    const getDocResponse = async (request) => {
        const entities = await getDocEntities();
        docEntities = entities.entities;
        const events = await currentDocEvents;
        let doc = Object.assign({}, emptyDoc);
        doc.action = 'getDocument';
        doc.entities = entities.entities;
        doc.relations = [];
        doc.equivs = entities.equivs;
        doc.text = events[0].data.abstract;
        request.success(doc);
    };

    const loadConfResponse = {
        action: "loadConf",
        messages: [],
        protocol: 1
    };

    const saveDocData = (request) => {
        docEntities = request.data.sourceData.entities;
        docArcs = request.data.sourceData.equivs;
    };

    window.ajaxCallback = (request) => {
        switch (request.data.action) {
            case 'createArc':
                request.success(createArcResponse(request.data))
                saveDocData(request);
                break;
            case 'deleteArc':
                request.success(deleteArcResponse(request.data))
                saveDocData(request);
                break;
            case 'createSpan':
                request.success(createSpanResponse(request.data))
                saveDocData(request);
                break;
            case 'deleteSpan':
                request.success(deleteSpanResponse(request.data))
                saveDocData(request);
                break;
            case 'getCollectionInformation':
                generateCollectionVals(request);
                break;
            case 'getDocument':
                getDocResponse(request);
                break;
            case 'loadConf':
                request.success(loadConfResponse);
                break;
            case 'logout':
                break;
            case 'saveConf':
                break;
            default:
                console.warn("Unhandled brat action:", request.data.action, request.data);
        }
    };
})();
