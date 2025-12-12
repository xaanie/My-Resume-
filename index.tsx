/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
  FunctionDeclaration,
  Type,
  Tool,
} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

const RESUME_CONTENT = `
NGONI SHAANI
220 Dwight St, Jersey City, NJ 0705 | 201 993 5200 | nshaani@mail.yu.edu

EDUCATION
Yeshiva University, Katz School of Science and Health, New York, USA
Master of Science in Computer Science, Expected December 2026

Midlands State University, Harare, Zimbabwe
Bachelor of Science in Computer Science, Aug 2023

WORK EXPERIENCE
Data Analyst, iGlow Media Studios, Lydenburg, South Africa (Aug 2023 – Dec 2024)
• Led and executed website and audience performance tracking by leveraging Google Analytics, Google Trends, and platform insights dashboards, generating data-driven recommendations that improved audience engagement by 35%.
• Collaborated with design (Figma, Canva) and content teams to interpret user-behavior data and align content strategy with performance findings, increasing lead generation by 28% and strengthening overall brand visibility.

Data Scientist, Advanced Furnace Technology, Cambridge, United Kingdom (Remote) (Feb 2022 – Jul 2023)
• Designed and communicated data-driven insights using Python (Pandas, NumPy) and Google Analytics, helping sales and marketing teams understand customer inquiry trends and improving qualified lead targeting accuracy by 22%.
• Built clear and concise performance reports for stakeholders using visualization tools (Matplotlib, Seaborn), improving leadership decision-making.
• Designed and executed A/B testing experiments to evaluate landing-page performance and inquiry-form interactions, informing changes that improved conversion rates by 18%

PROJECTS
ML-Based Trading Strategy (Jan 2025 – May 2025)
• Built a market-data collection system using Python, Airflow DuckDB, and APIs.
• Developed predictive market-analysis using NLTK and transformers.

A.I Based CCTV Monitoring and Alert System (Jan 2025 – Jul 2025)
• Built an AI-powered video analytics system using SmolVLM to process CCTV feeds.

Ask-the-10K Financial RAG Assistant (Jan 2025 – Jul 2025)
• Scraped SEC 10-K filings using Python and built a RAG system using LangChain, FAISS.

Tobacco Auction Floor Pricing Analytics (Apr 2025 – Oct 2025)
• Scraped daily auction-floor tobacco prices by grade using Python and built a clean dataset to run machine learning forecast.

TECHNICAL SKILLS
Languages: Python, Java, C#, HTML5, JavaScript, PHP, C, SQL, R
Cloud/DevOps: AWS, Azure, Docker, Git/GitHub, Snowflake, CI/CD
Data Science: Algo Trading, Machine Learning, Data Analytics, ETL, Tableau, Power BI
`;

const RECORD_NOTE_TOOL: FunctionDeclaration = {
  name: 'record_interview_note',
  description: 'Records a specific note, feedback, or data point mentioned during the interview into the candidate tracking system.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: 'The category of the note (e.g., Salary Expectation, Feedback, Action Item, Skill Gap).',
      },
      content: {
        type: Type.STRING,
        description: 'The content of the note to be recorded.',
      },
    },
    required: ['category', 'content'],
  },
};

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = 'Ready to start interview';
  @state() error = '';
  @state() recordedNotes: Array<{category: string; content: string}> = [];

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    :host {
      display: block;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: rgba(255, 255, 255, 0.7);
      pointer-events: none;
    }

    .notes-panel {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 300px;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 16px;
      z-index: 20;
      color: white;
      max-height: 80vh;
      overflow-y: auto;
    }

    .notes-panel h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      padding-bottom: 8px;
    }

    .note-item {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .note-category {
      font-weight: bold;
      color: #8ab4f8;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        transition: all 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }
      }

      button[disabled] {
        display: none;
      }
    }
    
    .intro {
      position: absolute;
      top: 20px;
      left: 20px;
      z-index: 20;
      color: white;
      max-width: 300px;
    }
    
    .intro h1 {
      font-size: 24px;
      margin: 0 0 5px 0;
    }
    .intro p {
      font-size: 14px;
      opacity: 0.8;
      margin: 0;
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connection established. Click Mic to start.');
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls (The Autonomous Task)
            if (message.toolCall) {
              this.handleToolCall(message.toolCall);
            }

            // Handle Audio
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Disconnected: ' + e.reason);
          },
        },
        config: {
          systemInstruction: `You are Ngoni Shaani. You are currently in a job interview. The user is the interviewer.
          
          RESUME CONTEXT:
          ${RESUME_CONTENT}

          PERSONA GUIDELINES:
          1. Speak with a clear, educated, and professional African accent. Vary your pace to sound natural and thoughtful.
          2. Be confident but humble. Elaborate on your projects (Trading Strategy, CCTV system) when asked.
          3. If the interviewer asks about a skill not on your resume, be honest.
          4. You have a "notebook" with you. If the interviewer asks you to note something down, record feedback, or save a salary expectation, you MUST use the 'record_interview_note' tool to save it.
          5. Keep responses concise enough for voice conversation, but detailed enough to show expertise.
          `,
          tools: [{functionDeclarations: [RECORD_NOTE_TOOL]}],
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Charon'}},
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError(e.message);
    }
  }

  private handleToolCall(toolCall: any) {
    const functionCalls = toolCall.functionCalls;
    if (!functionCalls || functionCalls.length === 0) return;

    const functionResponses = [];

    for (const call of functionCalls) {
      if (call.name === 'record_interview_note') {
        const {category, content} = call.args;
        
        // Update State to show in UI
        this.recordedNotes = [...this.recordedNotes, {category, content}];
        
        // Provide success response back to model
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: {result: 'Note recorded successfully.'},
        });
      }
    }

    // Send response back to model so it can continue conversation
    if (functionResponses.length > 0) {
      this.session.sendToolResponse({
        functionResponses: functionResponses,
      });
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Interview in progress... Listening.');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Interview paused.');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private reset() {
    this.recordedNotes = [];
    this.session?.close();
    this.initSession();
    this.updateStatus('Interview reset.');
  }

  render() {
    return html`
      <div>
        <div class="intro">
          <h1>Ngoni Shaani</h1>
          <p>Candidate - MS Computer Science</p>
          <p style="font-size: 12px; margin-top: 5px; color: #aaa;">Job Interview Simulator</p>
        </div>

        <div class="notes-panel">
          <h3>Candidate Notebook (Auto-recorded)</h3>
          ${
            this.recordedNotes.length === 0
              ? html`<div style="font-style: italic; opacity: 0.6; font-size: 12px;">No notes recorded yet. Ask Ngoni to write something down.</div>`
              : this.recordedNotes.map(
                  (note) => html`
                    <div class="note-item">
                      <div class="note-category">${note.category}</div>
                      <div>${note.content}</div>
                    </div>
                  `
                )
          }
        </div>

        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}
            title="Reset Interview">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}
            title="Start Interview">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <path d="M50 10c-11.046 0-20 8.954-20 20v20c0 11.046 8.954 20 20 20s20-8.954 20-20V30c0-11.046-8.954-20-20-20z"/>
              <path d="M75 50c0 13.807-11.193 25-25 25S25 63.807 25 50h-8c0 17.03 12.918 31.025 29.5 32.72v9.28h15v-9.28C78.082 81.025 91 67.03 91 50h-8z"/>
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}
            title="Pause Interview">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="25" y="25" width="50" height="50" rx="5" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.status} <br/> <span style="color: #ff6b6b">${this.error}</span> </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}