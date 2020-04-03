/* eslint-disable consistent-return */
// Chatbot functions
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const dialogflow = require("dialogflow");
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const MessagingResponse = require("twilio").twiml.MessagingResponse;
const dotenv = require("dotenv");
dotenv.config()

const api_key = process.env.WHATSAPP_API_KEY;
const whatsapp_url = process.env.WHATSAPP_API_URL;
const projectId = process.env.PROJECT_ID
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

// Dialogflow Agent
async function dialogflowQuery(msg){
    console.log("Dialogflow Message =>", JSON.stringify(msg));
    // Send a query to the dialogflow agent, and return the query result.
    // * @param {string} projectId for the Project to be Used
    // A unique identifier for the given session
    const sessionId = msg.From;
    // Create a new session
    const sessionClient = new dialogflow.v2.SessionsClient({
        // Optional Auth parameters.
    });
    const sessionPath = sessionClient.sessionPath(projectId, sessionId);
    const langCode = "en";
    // The text query request.
    const requestBody = {
        session: sessionPath,
        queryInput: {
            text: {
                // The query to send to the dialogflow agent
                text: msg.content,
                // The language used by the client (en-US)
                languageCode: langCode
            }
        }
    };
    // Send request and log results
    const responseBody = await sessionClient.detectIntent(requestBody);
    console.log("Detected intent");
    console.log("responseBody", requestBody);
    const result = responseBody[0].queryResult;
    console.log(`   Query: ${result.queryText}`);
    console.log(`   Response: ${result.fulfillmentText}`);
    if (result.intent){
        console.log(`   Intent: ${result.intent.displayName}`);
        // log response from dialogflow in the firestore with fulfillment cloud function
    } else {
        console.log(`   No Intent matched.`);
        // Handled by fallback Intent - An Intent must always to be matched
    }
    return Promise.resolve(result);
}

// Handle WhatsApp Replies => Standard text (Clickatell)
async function replyUser(reply) {
    console.log("reply => Sending reply to user", JSON.stringify(reply))
    var xhr = new XMLHttpRequest(),
        body = JSON.stringify({
            "messages": [
                {
                    "channel": "whatsapp",
                    "to": reply.to,
                    "content": reply.content,
                    "previewFirstUrl": true
                }
            ]
        })
    xhr.open("POST", whatsapp_url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", api_key);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200){
            console.log("success");
        }
    };
    xhr.send(body);
    console.log(`Message Sent Successfully to user ${reply.to} => content:`, JSON.stringify(reply.content));
    return ({"ReplyUser": "Message sent"})
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(async (request, response) => {
    console.log("Dialogflow Request headers: " + JSON.stringify(request.headers));
    console.log("Dialogflow Request Body: " + JSON.stringify(request.body));
    try {
        // Retrieve messages based on whether it is text or image
        let message = request.body;
        let content = ("MediaUrl0" in request.body) ?  "Image Uploaded": request.body.Body;
        console.log("Message Retrieved =>", content);
        let base64Img = ("MediaUrl0" in request.body) ? request.body.MediaUrl0 : null;
        message.content = content
        console.log("Message Retrieved Successfully =>", JSON.stringify(message));
        let resp = await dialogflowQuery(message);
        let reply = {
            to: message.To,
            from: message.From,
            content: resp.fulfillmentText
        }
        // Handle WhatsApp Replies => Standard text (Twilio)
        const twiml = new MessagingResponse();
        twiml.message(reply.content)
        response.writeHead(200, { "Content-Type": "text/xml"});
        return response.end(twiml.toString())

    } catch (error) {
        console.log(error)
    }
});