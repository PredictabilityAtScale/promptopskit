// CloudFront Function — viewer-request
// Rewrites directory paths to serve index.html from S3.
// Deploy once, then all /docs/ style URLs resolve correctly.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }

  return request;
}
