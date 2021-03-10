import worker_threads from 'worker_threads';

enum WorkerThreadStatus {
    waiting = 0,
    running = 1,
    finished = 2
}

class WorkerThreadRecord<OUTPUT> {
    workerThread: worker_threads.Worker;
    status: WorkerThreadStatus;
    output: OUTPUT;
}

export class WorkerThreadMessenger<INPUT, OUTPUT> {
    receive(workerFunction: (input: INPUT) => Promise<OUTPUT>) {
        if (!worker_threads.isMainThread) {
            worker_threads.parentPort.on('message', async(message: INPUT) => {
                const output = await workerFunction(message);
                worker_threads.parentPort.postMessage(output);
            });
        }
    }
}

export class WorkerThreadPool<INPUT, OUTPUT> {
    private workers: WorkerThreadRecord<OUTPUT>[];

    constructor(fileName: string, size: number) {
        this.workers = new Array(size).fill(null).map(v => {
            const record = new WorkerThreadRecord<OUTPUT>();
            record.workerThread = new worker_threads.Worker(fileName);
            record.status = WorkerThreadStatus.waiting;
            record.workerThread.on('message', (message: OUTPUT) => {
                record.output = message;
                record.status = WorkerThreadStatus.finished;
            });
            return record;
        });
    }

    async submit(input: INPUT): Promise<OUTPUT> {
        let workerIndex = await this.waitAvailableWorkerIndex();
        const workerRecord = this.workers[workerIndex];
        workerRecord.status = WorkerThreadStatus.running;
        delete workerRecord.output;
        workerRecord.workerThread.postMessage(input);
        while (true) {
            if (this.workers[workerIndex].status == WorkerThreadStatus.finished) {
                workerRecord.status = WorkerThreadStatus.waiting;
                return workerRecord.output;
            }
            await sleep(1);
        }
    }

    async submitAll(inputs: INPUT[]): Promise<OUTPUT[]> {
        const outputs: OUTPUT[] = new Array(inputs.length);
        for (let i = 0; i < inputs.length; i++) {
            outputs[i] = await this.submit(inputs[i]);
        }
        return outputs;
    }

    private findAvailableWorkerIndex(): number {
        for (let i = 0; i < this.workers.length; i++) {
            if (this.workers[i].status == WorkerThreadStatus.waiting)
                return i;
        }
        return null;
    }

    private async waitAvailableWorkerIndex(): Promise<number> {
        while (true) {
            const index = this.findAvailableWorkerIndex();
            if (index != null)
                return index;
            await sleep(1);
        }
    }
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}