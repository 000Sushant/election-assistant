import { Component, ViewChild, ElementRef, AfterViewChecked, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss'
})
export class ChatWindowComponent implements AfterViewChecked, OnInit {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  messages: ChatMessage[] = [];
  userInput: string = '';
  isLoading: boolean = false;
  currentQuickReplies: string[] = [];

  constructor(
    private chatService: ChatService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.chatService.messageTrigger$.subscribe(text => {
      this.sendMessage(text);
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  sendMessage(text?: string) {
    const messageToSend = text || this.userInput;
    if (!messageToSend.trim() || this.isLoading) return;

    this.currentQuickReplies = [];
    this.messages.push({
      role: 'user',
      parts: [{ text: messageToSend }]
    });

    this.userInput = '';
    this.isLoading = true;

    this.chatService.sendMessage(messageToSend, this.messages.slice(0, -1)).subscribe({
      next: (res) => {
        const fullResponse = res.response;
        const parsedData = this.extractQuickReplies(fullResponse);
        
        this.messages.push({
          role: 'model',
          parts: [{ text: parsedData.cleanText }]
        });
        
        this.currentQuickReplies = parsedData.quickReplies;
        this.isLoading = false;
        
        // Extra scroll trigger after AI reply
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: (err) => {
        console.error('Chat error:', err);
        this.messages.push({
          role: 'model',
          parts: [{ text: "I'm sorry, I'm having trouble connecting right now. Please try again later." }]
        });
        this.isLoading = false;
      }
    });
  }

  /**
   * More robust scroll to bottom that handles dynamic content
   */
  private scrollToBottom(): void {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      try {
        // Use scrollTo for a smoother, more reliable experience
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'auto'
        });
      } catch (err) {
        // Fallback for older browsers
        element.scrollTop = element.scrollHeight;
      }
    }
  }

  private extractQuickReplies(text: string): { cleanText: string, quickReplies: string[] } {
    const splitKey = "### 4. Quick Follow-ups";
    let cleanText = text;
    let quickReplies: string[] = [];

    if (text.includes(splitKey)) {
      const parts = text.split(splitKey);
      cleanText = parts[0].trim();
      const listContent = parts[1];
      const matches = listContent.match(/[*•-]\s*(.*)/g);
      if (matches) {
        quickReplies = matches.map(m => m.replace(/^[*•-]\s*/, '').trim()).slice(0, 4);
      }
    } else {
      const lines = text.split('\n').map(l => l.trim());
      const bullets = lines.filter(l => l.startsWith('* ') || l.startsWith('- ') || l.startsWith('• '));
      if (bullets.length >= 4) {
        quickReplies = bullets.slice(-4).map(b => b.replace(/^[*•-]\s*/, '').trim());
        cleanText = lines.filter(l => !bullets.slice(-4).includes(l)).join('\n');
      }
    }
    return { cleanText, quickReplies };
  }

  formatMessage(text: string): SafeHtml {
    const rawHtml = marked.parse(text) as string;
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }
}
