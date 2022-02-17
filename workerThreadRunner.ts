import worker_threads from 'worker_threads';

export class WorkerThreadRunner<INPUT, OUTPUT> {
    async main(workerFunction: (input: INPUT) => Promise<OUTPUT>) {
        if (!worker_threads.isMainThread) {
            const input: INPUT = worker_threads.workerData;
            try {
                const output = await workerFunction(input);
                worker_threads.parentPort?.postMessage(output);
            } catch (e) {
                worker_threads.parentPort?.postMessage({_wtException: e});
                return;
            }
        }
    }

    async run(filePath: string, input: INPUT): Promise<OUTPUT> {
        const worker = new worker_threads.Worker(filePath, { workerData: input });
        const output = await WorkerThreadRunner.waitForMessage(worker);
        await worker.terminate();
        return output;
    }

    private static waitForMessage(worker: worker_threads.Worker): Promise<any> {
        return new Promise((resolve, reject) => {
            worker.on('message', message => {
                if (message && message._wtException)
                    reject(message._wtException);
                else
                    resolve(message);
            });
            worker.on('error', error => reject(error));
        });
    }
}



