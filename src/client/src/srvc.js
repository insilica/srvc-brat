(function () {
  // srvc-related

  var config = null;
  var currentDocEvents = null;
  var docEntities = null;

  const loadConfig = function () {
    config = new Promise((resolve, reject) => {
      var req = new XMLHttpRequest();
      req.addEventListener("load", function (resp) {
        resolve(JSON.parse(req.response));
      });
      req.open("GET", "/config");
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
      req.open("GET", "/current-doc-events");
      req.send();
    });
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const bratToWebAnno = async (entities) => {
    var annos = [];
    for (i in entities) {
      const doc = (await currentDocEvents)[0];
      const entity = entities[i];
      const end = entity[2][0][1];
      const start = entity[2][0][0];
      const anno = {
        "@context": "http://www.w3.org/ns/anno.jsonld",
        "body": [
          {
            "purpose": "tagging",
            "type": "TextualBody",
            "value": entity[1],
          }],
        "id": generateUUID(),
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
    return annos;
  };

  const submitDoc = async function () {
    var req = new XMLHttpRequest();
    req.addEventListener("load", function (resp) {
      docEntities = null;
      loadCurrentDocEvents();
    })
    req.open("POST", "/submit-label-answers");
    req.setRequestHeader("Content-Type", "application/json");
    var answer = {
      "data": {
        "answer": await bratToWebAnno(docEntities),
        "document": (await currentDocEvents)[0].hash,
        "label": (await config).current_labels[0].hash,
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
        targets: targets,
        type: k
      });
    }
    return arcs;
  }

  const generateEntityTypes = async () => {
    var types = [];
    const label = (await config).current_labels[0]
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

    return [txt, [[pos.start, pos.end]]]
  };

  const getDocEntities = async () => {
    const cfg = await config;
    const events = await currentDocEvents;
    const label = (cfg.current_labels || [null])[0];
    if (!label) return [];
    var entities = [];
    for (i in events) {
      const event = events[i];
      if (event.type == 'label-answer'
        //&& label.hash == event.data.label
      ) {
        for (j in event.data.answer) {
          entities.push(webAnnoToBrat(event.data.answer[j]))
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
    var uniqueEntities = [];
    for (i in entities) {
      const entity = entities[i];
      if (!lastEntity || lastEntity[0] != entity[0] || lastEntity[1][0][0] != entity[1][0][0] || lastEntity[1][0][1] != lastEntity[1][0][1]) {
        uniqueEntities.push(entity);
      }
      lastEntity = entity;
    }
    entities = uniqueEntities;

    // Add indices
    for (i in entities) {
      entities[i].unshift(i + '');
    }
    return entities;
  };

  const getDocResponse = async (request) => {
    const entities = await getDocEntities();
    docEntities = entities;
    const events = await currentDocEvents;
    let doc = Object.assign({}, emptyDoc);
    doc.action = 'getDocument';
    doc.entities = entities
    doc.relations = [];
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
  };

  window.ajaxCallback = (request) => {
    switch (request.data.action) {
      //case 'createArc':
      //request.success(createArcResponse(request.data))
      //saveDocData(request);
      // break;
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
