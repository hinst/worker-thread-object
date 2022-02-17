import worker_threads from 'worker_threads';

enum WorkerThreadStatus {
    waiting = 'w',
    running = 'r',
    finished = 'f'
}

class WorkerThreadRecord<OUTPUT> {
    constructor(
        public workerThread: worker_threads.Worker,
        public status: WorkerThreadStatus,
    ) {
    }
    output?: OUTPUT;
}

export class WorkerThreadMessenger<INPUT, OUTPUT> {
    receive(workerFunction: (input: INPUT) => Promise<OUTPUT>) {
        if (!worker_threads.isMainThread) {
            worker_threads.parentPort?.on('message', async(message: INPUT) => {
                const output = await workerFunction(message);
                worker_threads.parentPort?.postMessage(output);
            });
        }
    }
}

export class WorkerThreadPool<INPUT, OUTPUT> {
    private workers: WorkerThreadRecord<OUTPUT>[];

    constructor(fileName: string, size: number) {
        this.workers = [];
        for (let i = 0; i < size; i++) {
            const record = new WorkerThreadRecord<OUTPUT>(
                new worker_threads.Worker(fileName),
                WorkerThreadStatus.waiting
            );
            record.workerThread.on('message', (message: OUTPUT) => {
                record.output = message;
                record.status = WorkerThreadStatus.finished;
            });
            this.workers.push(record);
        }
    }

    async submit(input: INPUT): Promise<OUTPUT> {
        let workerIndex: number = 0;
        while (true) {
            const index = this.findAvailableWorkerIndex();
            if (index != null) {
                workerIndex = index;
                break;
            }
            await sleep(1);
        }

        if (this.workers[workerIndex].status == WorkerThreadStatus.waiting)
            this.workers[workerIndex].status = WorkerThreadStatus.running;
        else
            throw new Error('Bad scheduling');
        this.workers[workerIndex].output = undefined;
        console.log('posting ' + workerIndex, this.workers.map(w => w.status).join(''));
        this.workers[workerIndex].workerThread.postMessage(input);
        while (true) {
            if (this.workers[workerIndex].status == WorkerThreadStatus.finished) {
                this.workers[workerIndex].status = WorkerThreadStatus.waiting;
                console.log('returning ' + workerIndex);
                return this.workers[workerIndex].output!;
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

    private findAvailableWorkerIndex(): number | null {
        for (let i = 0; i < this.workers.length; i++) {
            if (this.workers[i].status == WorkerThreadStatus.waiting)
                return i;
        }
        return null;
    }

    get hasFreeSlots(): boolean {
        return this.workers.some(w => w.status == WorkerThreadStatus.waiting);
    }
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}