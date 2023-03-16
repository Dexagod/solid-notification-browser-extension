const N3 = require('n3');

// Handle notifications

export async function handleNotifications() { 
    let inboxURL = "https://pod.rubendedecker.be/inbox/"
    let res = await fetch(inboxURL, { headers: { "Accept": "text/turtle" } })
    let contents = await res.text()
    let quads = await new N3.Parser({baseIRI: inboxURL}).parse(contents);

    let notificationInfos = []
    let notificationIds = []
    for (let quad of quads) { 
        if (quad.predicate.value === "http://www.w3.org/ns/ldp#contains") { 
            notificationIds.push(quad.object.value)
        }
    }
    for (let quad of quads) { 
        if (quad.predicate.value === "http://purl.org/dc/terms/modified"
            && notificationIds.includes(quad.subject.value)) { 
            notificationInfos.push({
                id: quad.subject.value,
                modified: new Date(quad.object.value),
            })
        }
    }

    // Note: We order according to the Solid pod ordering, not according to the individual notification published value ordering! For speed sake in this case!
    notificationInfos.sort(((n1, n2) => { return (n2.modified - n1.modified) }))

    for (let notificationInfo of notificationInfos) { 
        let displayData = null;
        try {
            displayData = await processNotification(notificationInfo);
        } catch (e) {
            console.error('failed to load activity')
            console.error(e.toString())
        }
        if (displayData) { 
            displayNotification(displayData);
        }
    }
}

const AS = "https://www.w3.org/ns/activitystreams#"
const XSD = "http://www.w3.org/2001/XMLSchema#"
const FOAF = "http://xmlns.com/foaf/0.1/"
const SCHEMA = "http://schema.org/"
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"

async function processNotification(notificationInfo) { 

    let res = await fetch(notificationInfo.id, { headers: { "Accept": "text/turtle" } })
    let contents = await res.text()
    let quads = await new N3.Parser({baseIRI: notificationInfo.id}).parse(contents);
    
    let store = new N3.Store(quads);

    let idTerms = store.getQuads(null, AS + "generator", null).map(q => q.subject);

    let activityIdTerm = null
    // We want a generator object for information to display the notification
    if (idTerms.length < 1) return;
    // Look for the head notification
    if (idTerms.length > 1) { 
        for (let idTerm of idTerms) { 
            if (
                !store.getQuads(null, AS + "subject", idTerm) &&
                !store.getQuads(null, AS + "object", idTerm) &&
                !store.getQuads(null, AS + "target", idTerm) &&
                !store.getQuads(null, AS + "actor", idTerm)
            )
                activityIdTerm = idTerm
        }
        // Fallback on random one
    };
    if (!activityIdTerm) activityIdTerm = idTerms[0];

    // Get generator information
    let generatorIdTerm = store.getQuads(null, AS + "generator", null).map(q => q.object)[0];

    let smallIcon = {}
    let smallIconTerm = store.getQuads(generatorIdTerm, AS + "icon", null).map(q=>q.object)[0]
    console.log('smallIconTerm', smallIconTerm)
    if (smallIconTerm) store.getQuads(smallIconTerm, null, null).map(q => { smallIcon[clearURI(q.predicate.value)] = processTerm(q.object) })
    if (!smallIcon.url) smallIcon.url = await getImageUrl(generatorIdTerm.value) 

    let largeIcon = {}
    let largeIconTerm = store.getQuads(activityIdTerm, AS + "image", null).map(q=>q.object)[0]
    console.log('largeIconTerm', largeIconTerm)
    if (largeIconTerm) store.getQuads(largeIconTerm, null, null).map(q => { largeIcon[clearURI(q.predicate.value)] = processTerm(q.object) })
    if (!largeIcon.url) largeIcon = null;
    
    let appName = store.getQuads(generatorIdTerm, AS + "name", null).map(q => processTerm(q.object))[0]
    let appType = store.getQuads(generatorIdTerm, RDF + "type", null).map(q => processTerm(q.object))[0]

    let timestamp = store.getQuads(activityIdTerm, AS + "published", null).map(q => processTerm(q.object))[0]
    let title = store.getQuads(activityIdTerm, AS + "name", null).map(q => processTerm(q.object))[0]
    let text = store.getQuads(activityIdTerm, AS + "content", null).map(q => processTerm(q.object))[0]
    if(!text) text = store.getQuads(activityIdTerm, AS + "summary", null).map(q => processTerm(q.object))[0]
    let type = store.getQuads(activityIdTerm, RDF + "type", null).map(q => processTerm(q.object))[0]

    let activity = {
        id: activityIdTerm.value,
        smallIcon,
        largeIcon,
        appName,
        appType,
        timestamp,
        title,
        text,
        type
    }

    console.log('activity', activity)
    return activity    
}

function clearURI(uri) { 
    let arr = uri.split("#").reverse()
    let string = arr[0] || arr[1]
    arr = string.split("/").reverse()
    return arr[0] || arr[1]
}

function processTerm(term) { 
    if (term.termType === "Literal") {
        return processLiteral(term)
    } else { 
        return term.value
    }
}

function processLiteral(lit) { 
    let value;
    switch (lit.datatype.value) {
        case XSD + "integer":
            value = parseInt(lit.value)
            break;
        case XSD + "nonNegativeInteger":
            value = parseInt(lit.value)
            break;
        case XSD + "decimal":
            value = parseFloat(lit.value)
            break;
        case XSD + "boolean":
            value = new Boolean(lit.value)
            break;
        case XSD + "date":
            value = new Date(lit.value)
            break;
        case XSD + "time":
            value = new Date(lit.value)
            break;
        case XSD + "dateTime":
            value = new Date(lit.value)
            break;
        case XSD + "string":
            value = lit.value
            break;
        default:
            value = lit.value
            break;
    }
    return value
}


    
async function getImageUrl(id) {
    try {
        let res = await fetch(id, { headers: { "Accept": "text/turtle" } })
        let contents = await res.text()
        let quads = await new N3.Parser({ baseIRI: inboxURL }).parse(contents);
        for (let quad of quads) {
            if (quad.predicate.value === SCHEMA + "image" || quad.predicate.value === FOAF + "img")
                return quad.object.value
        }
    } catch (e) { 
        console.error(`could not find image for ${id}`);
    }
}

function displayNotification(displayData) { 
    let options = {
        iconUrl: displayData.smallIcon.url,
        imageUrl: displayData.largeIcon.url,
        message: displayData.text || "",
        title: displayData.title || "",
        type: "basic",
    }
    function callback() {
        console.log("Notification succesfull");
    }
    chrome.notifications.create(options, callback)
}