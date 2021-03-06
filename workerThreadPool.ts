import worker_threads from 'worker_threads';

enum WorkerThreadStatus {
    waiting = 'w',
    running = 'r',
    finished = 'f'
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
        this.workers = [];
        for (let i = 0; i < size; i++) {
            const record = new WorkerThreadRecord<OUTPUT>();
            record.workerThread = new worker_threads.Worker(fileName);
            record.status = WorkerThreadStatus.waiting;
            if (false)
            record.workerThread.on('message', (message: OUTPUT) => {
                console.log('got message ' + i, message);
                record.output = message;
                record.status = WorkerThreadStatus.finished;
            });
            this.workers.push(record);
        }
    }

    async submit(input: INPUT): Promise<OUTPUT> {
        const workerIndex = await this.waitAvailableWorkerIndex();
        this.workers[workerIndex].status = WorkerThreadStatus.running;
        this.workers[workerIndex].output = undefined;
        console.log('posting ' + workerIndex, this.workers.map(w => w.status).join(''));
        this.workers[workerIndex].workerThread.postMessage(input);
        while (true) {
            if (this.workers[workerIndex].status == WorkerThreadStatus.finished) {
                this.workers[workerIndex].status = WorkerThreadStatus.waiting;
                console.log('returning ' + workerIndex);
                return this.workers[workerIndex].output;
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

    get hasFreeSlots(): boolean {
        return this.workers.some(w => w.status == WorkerThreadStatus.waiting);
    }
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}