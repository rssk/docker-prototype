'use strict';

const Docker = require('dockerode');

// TODO: ENV specific socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const streamPool = {};
const jobPool = {};

const manageStream = (stream, jobId) => {
  streamPool[jobId] = { stream, data: '' };

  stream.on('data', (chunk) => {
    streamPool[jobId].data += chunk;
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve(streamPool[jobId].data);
      streamPool[jobId] = undefined;
      jobPool[jobId] = undefined;
    });
    stream.on('error', (err) => {
      streamPool[jobId] = undefined;
      jobPool[jobId] = undefined;
      reject(err);
    });
  });
};

const queueJob = (jobId, opts) => {
  const jobOpts = Object.assign(
    {
      Image: opts.image,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['python', '/computation/computation.py'],
    },
    opts
  );
  return docker.createContainer(jobOpts).then((container) => {
    jobPool[jobId] = container;

    // Return a Promise that resolves when the container's data stream 2closes,
    // which should happen when the comp is done.
    const dataFinished = new Promise((resolve, reject) => {
      container.attach({ stream: true, stdout: true, stderr: true }, (err, stream) => {
        if (!err) {
          resolve(manageStream(stream));
        }

        reject(err);
      });
    });

    return container.start()
    .then(() => dataFinished);
  });
};

module.exports = {
  queueJob,
};
